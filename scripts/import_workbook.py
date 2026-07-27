#!/usr/bin/env python3
"""Import Maxine's workbook and enrich it with the open Funko catalog.

Only the Marvel, Others, ones to collect, and Ones for sale sheets are used.
The importer deliberately ignores Movie order for shelves and Sheet5, as well
as archival/working sheets. It uses only Python's standard library.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import unicodedata
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET
from zipfile import ZipFile

MAIN_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
PKG_REL_NS = "{http://schemas.openxmlformats.org/package/2006/relationships}"
DEFAULT_WORKBOOK = Path("/home/flyrat/.codex/attachments/9afa95ce-6f97-4017-9074-8fa91b35ddc9/Pop collection.xlsx")
DEFAULT_CATALOG = Path("/tmp/tmp.sIAA8sRNB9/catalog/funko_pop.json")
DEFAULT_SEED = Path("src/data/seed.json")
DEFAULT_CATALOG_OUTPUT = Path("public/data/catalog.json")


def clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").replace("\xa0", " ")).strip()


def normalized(value: str) -> str:
    value = html.unescape(clean(value)).lower()
    replacements = {
        "black light": "blacklight",
        "die cast": "diecast",
        "glow in the dark": "glow",
        "spiderman": "spider man",
        "spider-man": "spider man",
        "solider": "soldier",
        "voldmort": "voldemort",
        "m'": "m ",
    }
    for source, target in replacements.items():
        value = value.replace(source, target)
    value = "".join(char for char in unicodedata.normalize("NFKD", value) if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def column_name(cell_reference: str) -> str:
    return "".join(char for char in cell_reference if char.isalpha())


def workbook_rows(path: Path) -> dict[str, list[dict[str, str]]]:
    with ZipFile(path) as archive:
        shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        shared = [
            "".join(node.text or "" for node in item.iter(MAIN_NS + "t"))
            for item in shared_root.findall(MAIN_NS + "si")
        ]

        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relations = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {
            relation.attrib["Id"]: relation.attrib["Target"]
            for relation in relations.findall(PKG_REL_NS + "Relationship")
        }

        sheets: dict[str, list[dict[str, str]]] = {}
        sheets_node = workbook.find(MAIN_NS + "sheets")
        for sheet in list(sheets_node) if sheets_node is not None else []:
            name = sheet.attrib["name"]
            relation_id = sheet.attrib[REL_NS + "id"]
            target = targets[relation_id]
            if not target.startswith("worksheets/"):
                continue
            sheet_root = ET.fromstring(archive.read("xl/" + target))
            rows: list[dict[str, str]] = []
            for row in sheet_root.findall(f".//{MAIN_NS}sheetData/{MAIN_NS}row"):
                values: dict[str, str] = {}
                for cell in row.findall(MAIN_NS + "c"):
                    ref = cell.attrib.get("r", "")
                    value_node = cell.find(MAIN_NS + "v")
                    value = ""
                    if value_node is not None:
                        value = value_node.text or ""
                        if cell.attrib.get("t") == "s":
                            value = shared[int(value)]
                        elif cell.attrib.get("t") == "b":
                            value = "true" if value == "1" else "false"
                    inline = cell.find(MAIN_NS + "is")
                    if inline is not None:
                        value = "".join(node.text or "" for node in inline.iter(MAIN_NS + "t"))
                    values[column_name(ref)] = clean(value)
                if any(values.values()):
                    values["__row"] = row.attrib.get("r", "")
                    rows.append(values)
            sheets[name] = rows
        return sheets


def make_id(prefix: str, row: dict[str, str]) -> str:
    digest = hashlib.sha1(
        f"{prefix}|{row.get('__row')}|{row.get('A')}|{row.get('B')}|{row.get('C')}".encode("utf-8")
    ).hexdigest()[:10]
    return f"{prefix}-{row.get('__row', '0')}-{digest}"


def numeric(value: str, default: int = 1) -> int:
    try:
        result = int(float(value))
        return result if result > 0 else default
    except (TypeError, ValueError):
        return default


def load_catalog(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as source:
        raw = json.load(source)
    seen: set[tuple[str, str]] = set()
    catalog: list[dict[str, Any]] = []
    for entry in raw:
        series = [clean(item) for item in entry.get("series", []) if clean(item)]
        if "Pop! Vinyl" not in series:
            continue
        title = clean(html.unescape(entry.get("title", "")))
        image_url = clean(entry.get("imageName") or entry.get("image") or "")
        if not title:
            continue
        key = (normalized(title), image_url)
        if key in seen:
            continue
        seen.add(key)
        catalog.append(
            {
                "handle": clean(html.unescape(entry.get("handle", ""))),
                "title": title,
                "imageUrl": image_url,
                "series": series,
            }
        )
    return catalog


def catalog_matcher(catalog: list[dict[str, Any]]):
    index: dict[str, set[int]] = defaultdict(set)
    normalized_titles: list[str] = []
    token_sets: list[set[str]] = []
    for idx, entry in enumerate(catalog):
        title = normalized(entry["title"])
        tokens = set(title.split())
        normalized_titles.append(title)
        token_sets.append(tokens)
        for token in tokens:
            if len(token) > 1:
                index[token].add(idx)

    variant_words = {
        "chase", "metallic", "flocked", "glow", "diamond", "blacklight",
        "patina", "diecast", "unmasked", "chrome",
    }
    identity_noise = {
        "a", "an", "and", "as", "at", "comic", "convention", "exclusive",
        "fall", "funko", "in", "of", "on", "pop", "series", "summer", "the",
        "with", "year", "2020", "2021", "2022", "2023", "2024", "2025", "2026",
    }
    generic_titles = {"agent", "captain", "doctor", "king", "lady", "mr", "ms", "princess", "queen"}

    def match(name: str, category: str) -> dict[str, Any] | None:
        source = normalized(name)
        source_tokens = set(source.split())
        candidates: set[int] = set()
        for token in source_tokens:
            candidates.update(index.get(token, set()))
        if not candidates:
            return None

        source_variants = source_tokens & variant_words
        source_identity = source_tokens - variant_words - identity_noise
        distinctive_identity = source_identity - generic_titles
        best_idx = -1
        best_score = 0.0
        for idx in candidates:
            title = normalized_titles[idx]
            target_tokens = token_sets[idx]
            if distinctive_identity and not distinctive_identity.intersection(target_tokens):
                continue
            if source_variants and not source_variants.issubset(target_tokens):
                continue
            overlap = len(source_tokens & target_tokens) / max(len(source_tokens | target_tokens), 1)
            ratio = SequenceMatcher(None, source, title).ratio()
            score = ratio * 0.72 + overlap * 0.23
            target_identity = target_tokens - variant_words - identity_noise
            if source_identity and source_identity == target_identity:
                score += 0.12
            score -= len((target_tokens & variant_words) - source_variants) * 0.15
            if source == title:
                score += 0.12
            if category == "Marvel" and "Pop! Marvel" in catalog[idx]["series"]:
                score += 0.05
            if score > best_score:
                best_idx = idx
                best_score = score

        if best_idx < 0 or best_score < 0.80:
            return None
        entry = catalog[best_idx]
        return {
            "title": entry["title"],
            "imageUrl": entry["imageUrl"],
            "series": entry["series"],
            "confidence": round(min(best_score, 1), 3),
        }

    return match


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workbook", type=Path, default=DEFAULT_WORKBOOK)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--seed-output", type=Path, default=DEFAULT_SEED)
    parser.add_argument("--catalog-output", type=Path, default=DEFAULT_CATALOG_OUTPUT)
    args = parser.parse_args()

    if not args.workbook.exists():
        parser.error(f"Workbook not found: {args.workbook}")
    if not args.catalog.exists():
        parser.error(f"Catalog not found: {args.catalog}")

    sheets = workbook_rows(args.workbook)
    catalog = load_catalog(args.catalog)
    match_catalog = catalog_matcher(catalog)
    items: list[dict[str, Any]] = []

    for sheet_name, category in (("Marvel", "Marvel"), ("Others", "Others")):
        rows = sheets.get(sheet_name, [])
        for row in rows[1:]:
            if not row.get("A"):
                continue
            matched = match_catalog(row["A"], category)
            items.append(
                {
                    "id": make_id(category.lower(), row),
                    "name": row["A"],
                    "number": row.get("B", ""),
                    "series": row.get("C", "") or "Unsorted",
                    "category": category,
                    "status": "owned",
                    "quantity": numeric(row.get("F", "")),
                    "condition": "Near mint",
                    "comments": row.get("G", "") if category == "Marvel" else row.get("F", ""),
                    "funkoApp": row.get("D", ""),
                    "hobbyDb": row.get("E", ""),
                    "sku": "",
                    "upc": "",
                    "favorite": False,
                    "location": "",
                    "purchasePrice": None,
                    "estimatedValue": None,
                    "askingPrice": None,
                    "valuationSource": "",
                    "valuedAt": "",
                    "catalogMatch": matched,
                    "customImageUrl": "",
                    "sourceRef": f"{sheet_name}!{row.get('__row')}",
                }
            )

    for row in sheets.get("ones to collect", []):
        if not row.get("A"):
            continue
        matched = match_catalog(row["A"], "Marvel")
        items.append(
            {
                "id": make_id("wishlist", row),
                "name": row["A"],
                "number": row.get("B", ""),
                "series": "Marvel wishlist",
                "category": "Marvel",
                "status": "wishlist",
                "quantity": 1,
                "condition": "Near mint",
                "comments": row.get("C", ""),
                "funkoApp": "",
                "hobbyDb": "",
                "sku": "",
                "upc": "",
                "favorite": False,
                "location": "",
                "purchasePrice": None,
                "estimatedValue": None,
                "askingPrice": None,
                "valuationSource": "",
                "valuedAt": "",
                "catalogMatch": matched,
                "customImageUrl": "",
                "targetSeller": row.get("D", ""),
                "targetPriceNote": row.get("E", ""),
                "sourceRef": f"ones to collect!{row.get('__row')}",
            }
        )

    sale_rows = sheets.get("Ones for sale", [])
    for row in sale_rows[1:]:
        if not row.get("A"):
            continue
        matched = match_catalog(row["A"], "Marvel")
        items.append(
            {
                "id": make_id("sale", row),
                "name": row["A"],
                "number": row.get("B", ""),
                "series": row.get("C", "") or "Unsorted",
                "category": "Marvel",
                "status": "sale",
                "quantity": 1,
                "condition": "Near mint",
                "comments": row.get("D", ""),
                "funkoApp": "",
                "hobbyDb": "",
                "sku": "",
                "upc": "",
                "favorite": False,
                "location": "",
                "purchasePrice": None,
                "estimatedValue": None,
                "askingPrice": None,
                "valuationSource": "",
                "valuedAt": "",
                "catalogMatch": matched,
                "customImageUrl": "",
                "sourceRef": f"Ones for sale!{row.get('__row')}",
            }
        )

    seed = {
        "schemaVersion": 2,
        "meta": {
            "title": "Maxine's Pop Tracker",
            "workbook": args.workbook.name,
            "catalogProject": "kennymkchan/funko-pop-data",
            "catalogCommit": "80313348ceb0ed410d75639585b977dc593fc534",
            "catalogLastUpdated": "2021-01-03",
            "includedSheets": ["Marvel", "Others", "ones to collect", "Ones for sale"],
            "ignoredSheets": ["Soda", "Movie order for shelves", "Sheet5", "Marvel old", "what if"],
        },
        "items": items,
    }

    args.seed_output.parent.mkdir(parents=True, exist_ok=True)
    args.catalog_output.parent.mkdir(parents=True, exist_ok=True)
    args.seed_output.write_text(json.dumps(seed, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    args.catalog_output.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    matched_count = sum(1 for item in items if item.get("catalogMatch"))
    print(f"Imported {len(items)} workbook rows")
    print(f"Matched {matched_count} rows to a suggested catalog image")
    print(f"Wrote {len(catalog)} Pop! Vinyl catalog entries to {args.catalog_output}")
    print(f"Wrote seed data to {args.seed_output}")


if __name__ == "__main__":
    main()

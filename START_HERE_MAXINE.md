# Start here, Maxine

This guide is for setting up **Maxine's Pop Tracker** on a Windows 10 computer.
You do not need to know how to program, and you do not need to type commands.

There are only three main jobs:

1. Download and extract the tracker.
2. Install Node.js once.
3. Double-click `start.bat` whenever you want to use the tracker.

## What you will need

- Your Windows 10 computer
- An internet connection
- A web browser such as Microsoft Edge, Chrome, or Firefox
- About 100 MB of free space

You do **not** need Docker, Python, a database, an eBay account, a Trade Me
account, or any programming tools just to use the tracker.

---

## Part 1: Download the tracker

### 1. Download the ZIP file

Click this link:

**[Download Maxine's Pop Tracker](https://github.com/flyingrat99/maxine_pops/archive/refs/heads/main.zip)**

Your browser should download a file called `maxine_pops-main.zip`, normally into
your **Downloads** folder.

### 2. Unblock the trusted ZIP if Windows offers the option

Only do this because the ZIP came from the expected
`flyingrat99/maxine_pops` GitHub repository.

1. Open your **Downloads** folder.
2. Right-click `maxine_pops-main.zip` and choose **Properties**.
3. Look near the bottom of the **General** tab.
4. If you see an **Unblock** checkbox, tick it.
5. Click **Apply**, then **OK**.

If there is no Unblock checkbox, that is fine—continue to the next step. Never
disable Microsoft Defender or your antivirus to run the tracker.

### 3. Extract the ZIP

Do not run the tracker from inside the ZIP file.

1. Right-click `maxine_pops-main.zip`.
2. Choose **Extract All...**.
3. Choose somewhere easy to find. Your **Documents** folder is a good choice.
4. Click **Extract**.

Windows will create a normal folder named `maxine_pops-main`. You may rename
that folder to `Maxine's Pop Tracker` if you like.

---

## Part 2: Install Node.js once

Node.js is the small runtime that starts the tracker. Installing Node.js also
installs `npm`; you do not need to install `npm` separately.

### 1. Download the LTS version

Go to the official website:

**[Download Node.js](https://nodejs.org/en/download)**

Choose:

- **LTS**, not “Current”
- **Windows Installer (.msi)**
- **64-bit / x64** for an ordinary Windows 10 PC

The tracker needs Node.js 22.12 or newer. The current LTS version shown on the
official download page is suitable.

If you are unsure whether the computer is 64-bit, open **Start > Settings >
System > About** and look for **System type**.

### 2. Install it

1. Open the downloaded `.msi` installer.
2. If Windows asks whether it may make changes, choose **Yes**.
3. Accept the licence and keep the normal/default options.
4. Keep clicking **Next**, then click **Install** and **Finish**.
5. Restart the computer after installation. This helps Windows recognise the
   new `node` command everywhere.

You only need to install Node.js once.

---

## Part 3: Start the tracker

1. Open the extracted `maxine_pops-main` or `Maxine's Pop Tracker` folder.
2. Find `start.bat`. Windows may show its type as **Windows Batch File**.
3. Double-click `start.bat`.
4. If Windows shows an **Open File – Security Warning**, check that the file is
   inside the folder you downloaded from the expected GitHub repository, then
   choose **Run**.
5. A black command window will open. Keep this window open while using the
   tracker.
6. The tracker should open automatically in your web browser at:

   `http://127.0.0.1:4173`

If the browser does not open automatically, type that address into the browser's
address bar.

### Make a desktop shortcut (optional)

To make starting it easier next time:

1. Right-click `start.bat`.
2. Choose **Send to > Desktop (create shortcut)**.
3. Rename the new shortcut to **Maxine's Pop Tracker**.

Use that shortcut whenever you want to start the tracker.

### Stop the tracker

When you are finished:

1. Return to the black command window.
2. Press **Ctrl+C**, or simply close that window.

If Windows asks `Terminate batch job (Y/N)?`, press **Y**, then **Enter**.

---

## Your collection and backups

The tracker saves changes automatically in the web browser on this computer.
That means:

- Keep using the same Windows account and browser where possible.
- Closing the tracker does not normally lose your changes.
- Clearing browser data can remove the saved collection.
- Your live edits are not automatically uploaded to GitHub.
- Opening the tracker on a different computer or in a different browser starts
  from the collection included in the download.

### Make a backup regularly

This is important, especially before asking an AI to change the app:

1. Open **Data & backup** in the tracker.
2. Click the button to download a full JSON backup.
3. Save the backup somewhere safe, such as Documents, OneDrive, or a USB drive.
4. Keep several dated backups rather than replacing the same one every time.

The JSON backup can restore your collection, wishlist, items for sale, notes,
values, images, identifiers, and other edits.

---

## Asking an AI to improve the tracker

Use an AI coding assistant that can open a folder and edit files—not only a
normal question-and-answer chatbot.

### Before the AI starts

1. Download a fresh JSON backup from **Data & backup**.
2. Close the black tracker window.
3. Give the AI access to the extracted tracker folder.
4. Tell the AI to read `ai_instructions.md` before doing anything.

### Copy and paste this message to the AI

Replace the words in square brackets with what you want changed:

> Please take over maintaining Maxine's Pop Tracker in this folder. First read
> `ai_instructions.md` and `README.md` completely, and follow those instructions.
> I am not technical, so explain the result in plain language and do the coding,
> testing, and production build for me. Do not delete, reset, or replace my
> collection data. My requested change is: **[describe what you want here]**.
> Please make the complete change, test it, and tell me exactly what to click or
> restart when you are finished.

Helpful things to give the AI include:

- A screenshot of what you can see
- A link to a Pop or information source
- The name and box number of an example Pop
- What you clicked
- What happened
- What you expected to happen instead

You can describe ideas normally. For example:

> On the wishlist, I would like a button that moves a Pop into my collection and
> asks for the purchase price and shelf location.

or:

> This Pop has the wrong picture. Here is the correct product page: [paste link].
> Please improve the information finder so it can use that source safely.

### If the AI cannot open a folder

Upload the complete `maxine_pops-main.zip` file to the AI if it accepts ZIP
files. Also attach `ai_instructions.md` and include the copy-and-paste message
above. Ask the AI to return a complete updated ZIP, not just snippets of code.

### What the AI should do for you

The instructions tell the AI to:

- Protect your browser collection and backups
- Keep Windows 10 and `start.bat` working
- Avoid containers and unnecessary accounts or passwords
- Verify Pop information rather than inventing it
- Test the app and rebuild the ready-to-run `dist` folder
- Explain what changed and what you need to restart

If an AI asks you to delete browser data, disable antivirus, paste passwords or
access tokens into chat, or run a destructive command you do not understand,
stop and ask for a safer method.

---

## Getting an updated version later

Before updating, make a JSON backup from **Data & backup**.

1. Close the running tracker.
2. Download the latest ZIP from the same GitHub download link.
3. Unblock and extract it as described above.
4. Keep the old folder until you have confirmed the new one starts correctly.
5. Start the new copy with its `start.bat`.

Your browser collection should still appear because the tracker uses the same
local address. Keep the JSON backup anyway in case anything goes wrong.

---

## Troubleshooting

### “Node.js is required” or “node is not recognised”

- Install the **LTS Windows Installer** from the official Node.js website.
- Restart the computer after installing it.
- Then double-click `start.bat` again.

### The browser says the page cannot be reached

- Check that the black command window is still open.
- Look in that window for an error message.
- Close any older tracker command windows, then try `start.bat` again.
- Make sure you are opening `http://127.0.0.1:4173`, including the `:4173`.

### Windows says the file is unsafe or blocked

- Confirm the ZIP came from the expected GitHub repository.
- Right-click the original ZIP, choose **Properties**, tick **Unblock** if it is
  available, then extract it again.
- Do not turn off Microsoft Defender or antivirus protection.

### I opened `start.bat`, but it immediately closed

- Node.js may not be installed yet, or Windows may need a restart after the
  installation.
- Open `start.bat` again and read any message in the black window before closing
  it.
- If asking for help, take a screenshot of that window.

### My recent collection changes are missing

- Make sure you are using the same browser and Windows account as before.
- Do not clear that browser's site data.
- Open **Data & backup** and restore your most recent JSON backup if needed.

---

## A Windows 10 security note

The tracker should run on Windows 10 with a supported Node.js LTS release.
However, Microsoft's free support for Windows 10 ended on 14 October 2025. Keep
Microsoft Defender and browser updates enabled, and plan an upgrade to a
supported Windows version when practical.

## Official help links

- [Node.js official download page](https://nodejs.org/en/download)
- [Microsoft: Zip and unzip files](https://support.microsoft.com/en-us/windows/zip-and-unzip-files-f6dde0a7-0fec-8294-e1d3-703ed85e7ebc)
- [Microsoft: Check whether a downloaded file is blocked](https://support.microsoft.com/en-us/windows/security/information-about-the-attachment-manager-in-microsoft-windows)
- [Microsoft: Windows 10 end-of-support information](https://support.microsoft.com/en-au/windows/serviced-versions-of-windows-10-frequently-asked-questions-0543e712-b23e-b6c0-034a-45d7b559ae88)

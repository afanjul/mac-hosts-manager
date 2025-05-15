# mac-hosts-manager

## Project Description

**mac-hosts-manager** is a modern macOS utility for managing your system's `/etc/hosts` file with a user-friendly interface. Built with React, Vite, and Electron, it streamlines editing, organizing, and applying host entries. The app is designed for macOS and includes potential integration with TouchID for secure, persistent sudo access.

## Features

- **Modern UI:** Fast, responsive interface built with React and Vite.
- **Hosts File Management:** Easily view, edit, add, remove, and reorder entries in your `/etc/hosts` file.
- **Drag-and-Drop Support:** Reorder host entries intuitively (powered by dnd-kit).
- **macOS Native Integration:** Electron-based desktop app tailored for macOS.
- **TouchID Sudo Integration:** Optionally leverage TouchID for secure sudo operations (see below).
- **Cross-Platform Packaging:** Scripts for building and packaging the app for macOS, Windows, and Linux.

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- [Yarn](https://yarnpkg.com/) or [npm](https://www.npmjs.com/)

### Steps

1. **Clone the repository:**
   ```sh
   git clone https://github.com/yourusername/mac-hosts-manager.git
   cd mac-hosts-manager
   ```

2. **Install dependencies:**
   ```sh
   npm install
   # or
   yarn install
   ```

3. **Start the application:**
   ```sh
   npm start
   # or
   yarn start
   ```

   This will launch both the Vite development server and the Electron app.

4. **Build for production:**
   ```sh
   npm run build
   npm run build-electron
   ```

5. **Package the app (macOS example):**
   ```sh
   npm run package:mac
   ```

   See [`package.json`](package.json:1) for more packaging options.

## Usage

- Launch the app using `npm start` or `yarn start`.
- The main window displays your current `/etc/hosts` entries.
- Add, edit, or remove entries as needed.
- Drag and drop entries to reorder them.
- Save changes to update your system's hosts file (admin privileges required).
- If TouchID integration is enabled, you can authenticate sudo operations with your fingerprint.

## TouchID Integration (macOS Sonoma+)

To enable persistent TouchID authentication for sudo operations (recommended for seamless experience):

1. Copy the template to create a local sudo PAM config:
   ```sh
   sudo cp /etc/pam.d/sudo_local.template /etc/pam.d/sudo_local
   ```

2. Edit `/etc/pam.d/sudo_local` and uncomment the following line:
   ```
   auth       sufficient     pam_tid.so
   ```

This configuration allows TouchID to be used for sudo and persists across system updates.
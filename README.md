# MJX CLIENT

[![npm version](https://img.shields.io/npm/v/mjx-client)](https://www.npmjs.com/package/mjx-client)  
[![License](https://img.shields.io/npm/l/mjx-client)](LICENSE)  
[![Node.js](https://img.shields.io/node/v/mjx-client)](https://nodejs.org/)  

MJX Client is a highly customizable Discord bot framework built on top of Discord.js v14. It allows structured management of commands, events, and bot behavior, providing a flexible framework for creating Discord bots.

---

## Features

- Structured event handling with support for `once` and recurring events.
- Easy registration of slash commands and automatic handling of interactions.
- Built-in debug logging
- Modular architecture with dynamic command and event loading.

---

## Installation

```bash
npm install mjx-client
```

---

## Configuration

MJX Client can be configured during instantiation, allowing you to set the client name(which can be acessed anytime from the client), enable debug mode, and specify Discord intents.

---

## Directory Structure

```
project/
│
├─ commands/       # Slash commands
├─ events/         # Event handlers
├─ src/
│   └─ index.ts    # Main bot entry
└─ package.json
```

---

## License

MJX Client is licensed under the MIT License. See [LICENSE](LICENSE) for details.

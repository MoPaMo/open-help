const sqlite3 = require("sqlite3").verbose();
const process = require("process");
const express = require("express");

const dbFile = "./db.sqlite3";
const fs = require("fs");

if (!fs.existsSync(dbFile)) {
  console.error("Database file does not exist.");
  process.exit(1);
}

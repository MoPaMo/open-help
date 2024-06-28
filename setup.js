const sqlite3 = require("sqlite3").verbose();
const process = require("process");
const express = require("express");
const crypto = require("crypto");

const dbFile = "./db.sqlite3";
const fs = require("fs");

if (!fs.existsSync(dbFile)) {
  console.error("Database file does not exist.");
  //create file
  fs.writeFileSync(dbFile, "");
} else {
  console.log("Database file already exists.");
  //delete file
  fs.unlinkSync(dbFile);
  console.log("Database file deleted.");
}
const db = new sqlite3.Database(dbFile);

db.serialize(() => {
  db.run(
    "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT, password TEXT)"
  );
});
db.close();

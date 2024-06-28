const sqlite3 = require("sqlite3").verbose();
const process = require("process");
const express = require("express");
const crypto = require("crypto");
const Handlebars = require("handlebars");
const fs = require("fs");
const app = express();
const port = 3000;
function generateRandomString(length) {
  return crypto
    .randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length);
}
app.use(express.static("public"));
const webpwd = generateRandomString(16);
const template = fs.readFileSync(__dirname + "/setup/template.html", "utf8");
const renderedTemplate = Handlebars.compile(template);
app.get("/:pwd/", (req, res) => {
  if (req.params.pwd == webpwd) {
    //send setup/start.html

    res.send(
      renderedTemplate({
        Title: "Start",
        Context: "This webapp will guide you through the setup of OpenHelp",
        next: "start",
        pwd: webpwd,
        proceed: true,
      })
    );
  } else {
    //error code
    res.status(401).send("Unauthorized");
  }
});
app.get("/:pwd/start", (req, res) => res.send("Hello World!"));
app.listen(port, () => {
  console.log(`Setup is running at http://localhost:${port}/${webpwd}`);
});

const dbFile = "./db.sqlite3";

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
let pwd = generateRandomString(24);
db.serialize(() => {
  db.run(
    "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT, password TEXT)"
  );
  db.run("INSERT INTO users (username, password) VALUES (?, ?)", [
    "admin",
    pwd,
  ]);
});
console.log("Database created with admin password: " + pwd);
db.close();

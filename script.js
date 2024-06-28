const express = require("express");
const app = express();
const port = 3000;
const sqlite = require("sqlite3");
const process = require("process");
const path = require("path");
const { env } = require("process");

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

// make all files under 'public' public
app.use(express.static(path.join(__dirname, "public")));

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});

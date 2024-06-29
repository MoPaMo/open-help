const sqlite3 = require("sqlite3").verbose();
const process = require("process");
const express = require("express");
const crypto = require("crypto");
const Handlebars = require("handlebars");
const fs = require("fs");
const nodemailer = require("nodemailer");
const app = express();
const port = 3000;
function generateRandomString(length) {
  return crypto
    .randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length);
}
const dbFile = "./db.sqlite3";
app.use(express.static("public"));
if (!process.argv.includes("dev")) {
  const webpwd = generateRandomString(16);
} else {
  const webpwd = "dev";
}
const template = fs.readFileSync(__dirname + "/setup/template.html", "utf8");
const renderedTemplate = Handlebars.compile(template);
Handlebars.registerHelper("ifEquals", function (arg1, arg2, options) {
  return arg1 == arg2 ? options.fn(this) : options.inverse(this);
});

app.get("/:pwd/", (req, res) => {
  if (req.params.pwd == webpwd) {
    //send setup/start.html

    res.send(
      renderedTemplate({
        Title: "Start",
        Context:
          "This webapp will guide you through the setup of OpenHelp <br> In the first step, we will create a database file. This will delete any db.sqlite3 file already existing!",
        next: "step1",
        pwd: webpwd,
      })
    );
  } else {
    //error code
    res.status(401).send("Unauthorized");
  }
});
app.get("/:pwd/step1", (req, res) => {
  if (req.params.pwd == webpwd) {
    //send setup/start.html
    if (!fs.existsSync(dbFile)) {
      //create file
      fs.writeFileSync(dbFile, "");
    } else {
      console.log("Database file already exists.");
      //delete file
      fs.unlinkSync(dbFile);
      console.log("Database file deleted.");
    }
    res.send(
      renderedTemplate({
        Title: "Database File Creation",
        Context: "",
        next: "step2",
        pwd: webpwd,
      })
    );
  } else {
    //error code
    res.status(401).send("Unauthorized");
  }
});
app.get("/:pwd/step2", (req, res) => {
  if (req.params.pwd == webpwd) {
    //send setup/start.html

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
    db.close();

    console.log("Database created with admin password: " + pwd);
    res.send(
      renderedTemplate({
        Title: "Table creation",
        Context: "We have created a database with the admin password: " + pwd,
        next: "step3",
        pwd: webpwd,
      })
    );
  } else {
    //error code
    res.status(401).send("Unauthorized");
  }
});

app.get("/:pwd/step3", (req, res) => {
  if (req.params.pwd == webpwd) {
    res.send(
      renderedTemplate({
        Title: "Email Setup",
        Context: "email",
        next: "finish",
        pwd: webpwd,
      })
    );
  } else {
    //error code
    res.status(401).send("Unauthorized");
  }
});
app.get("/:pwd/finish", (req, res) => {
  if (req.params.pwd == webpwd) {
    //send setup/start.html

    res.send(
      renderedTemplate({
        Title: "Setup finished",
        Context: `You have finished the setup. You can now login with the admin password: ${webpwd} . <br/>
        
          You can start the app by running npm start in the root folder.`,
        next: false,
        pwd: webpwd,
      })
    );
  } else {
    //error code
    res.status(401).send("Unauthorized");
  }
});
app.listen(port, () => {
  console.log(`Setup is running at http://localhost:${port}/${webpwd}`);
});

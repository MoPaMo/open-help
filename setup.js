const sqlite3 = require("sqlite3").verbose();
const process = require("process");
const express = require("express");
const crypto = require("crypto");
const Handlebars = require("handlebars");
const fs = require("fs");
const nodemailer = require("nodemailer");
const app = express();
app.use(express.urlencoded({ extended: true }));

const port = 3000;
function generateRandomString(length) {
  return crypto
    .randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length);
}

const dbFile = "./db.sqlite3";
let webpwd, pwd;
app.use(express.static("public"));
if (process.argv.includes("dev")) {
  webpwd = "dev";
} else {
  webpwd = generateRandomString(16);
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
    pwd = generateRandomString(24);
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
app.post("/:pwd/step4", (req, res) => {
  if (req.params.pwd == webpwd) {
    // Check if all required fields for sending and receiving emails are set
    if (
      req.body["send-host"] &&
      req.body["send-port"] &&
      req.body["send-user"] &&
      req.body["send-password"] &&
      req.body["receive-host"] &&
      req.body["receive-port"] &&
      req.body["receive-user"] &&
      req.body["receive-password"]
    ) {
      // Save data to config file
      const emailConfig = {
        send: {
          host: req.body["send-host"],
          port: req.body["send-port"],
          user: req.body["send-user"],
          password: req.body["send-password"],
        },
        receive: {
          host: req.body["receive-host"],
          port: req.body["receive-port"],
          user: req.body["receive-user"],
          password: req.body["receive-password"],
        },
      };
      fs.writeFileSync("./config.json", JSON.stringify(emailConfig, null, 2));
      console.log("Email configuration saved.");
      res.send(
        renderedTemplate({
          Title: "Email Setup Completed",
          Context: "Your email configuration has been saved.",
          next: "finish",
          pwd: webpwd,
        })
      );
    } else {
      res.status(400).send("All fields are required.");
    }
  } else {
    res.status(401).send("Unauthorized");
  }
});

app.get("/:pwd/finish", (req, res) => {
  if (req.params.pwd == webpwd) {
    //send setup/start.html

    res.send(
      renderedTemplate({
        Title: "Setup finished",
        Context: `You have finished the setup. You can now login with the admin password: <code>${pwd}</code>. <br/>
        
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

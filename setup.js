const sqlite3 = require("sqlite3").verbose();
const process = require("process");
const express = require("express");
const crypto = require("crypto");
const Handlebars = require("handlebars");
const fs = require("fs");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));

function generateRandomString(length) {
  return crypto
    .randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length);
}

const dbFile = process.env.DB_FILE || "./db.sqlite3";
let webpwd, pwd;

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

const authMiddleware = (req, res, next) => {
  if (req.params.pwd === webpwd) {
    next();
  } else {
    res.status(401).send("Unauthorized");
  }
};

app.use(express.static("public"));

app.get("/:pwd/", authMiddleware, (req, res) => {
  res.send(
    renderedTemplate({
      Title: "Start",
      Context:
        "This webapp will guide you through the setup of OpenHelp <br> In the first step, we will create a database file. This will delete any db.sqlite3 file already existing!",
      next: "step1",
      pwd: webpwd,
    })
  );
});

app.get("/:pwd/step1", authMiddleware, (req, res) => {
  if (!fs.existsSync(dbFile)) {
    try {
      fs.writeFileSync(dbFile, "");
    } catch (err) {
      return res.status(500).send("Error creating database file.");
    }
  } else {
    console.log("Database file already exists.");
    try {
      fs.unlinkSync(dbFile);
      console.log("Database file deleted.");
    } catch (err) {
      return res.status(500).send("Error deleting database file.");
    }
  }
  res.send(
    renderedTemplate({
      Title: "Database File Creation",
      Context: "",
      next: "step2",
      pwd: webpwd,
    })
  );
});

app.get("/:pwd/step2", authMiddleware, (req, res) => {
  const db = new sqlite3.Database(dbFile);
  pwd = generateRandomString(24);
  const hashedPwd = bcrypt.hashSync(pwd, 10);

  db.serialize(() => {
    db.run(
      "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT, password TEXT)",
      (err) => {
        if (err) {
          return res.status(500).send("Error creating table.");
        }
      }
    );
    db.run(
      "INSERT INTO users (username, password) VALUES (?, ?)",
      ["admin", hashedPwd],
      (err) => {
        if (err) {
          return res.status(500).send("Error inserting admin user.");
        }
      }
    );
  });

  db.close((err) => {
    if (err) {
      return res.status(500).send("Error closing database connection.");
    }
    console.log("Database created with admin password: " + pwd);
    res.send(
      renderedTemplate({
        Title: "Table creation",
        Context: `We have created a database with the admin password <code>${pwd}</code>.`,
        next: "step3",
        pwd: webpwd,
      })
    );
  });
});

app.get("/:pwd/step3", authMiddleware, (req, res) => {
  res.send(
    renderedTemplate({
      Title: "Email Setup",
      Context: "email",
      next: "finish",
      pwd: webpwd,
    })
  );
});

app.post("/:pwd/step4", authMiddleware, (req, res) => {
  const {
    "send-host": sendHost,
    "send-port": sendPort,
    "send-user": sendUser,
    "send-password": sendPassword,
    "receive-host": receiveHost,
    "receive-port": receivePort,
    "receive-user": receiveUser,
    "receive-password": receivePassword,
  } = req.body;

  if (
    sendHost &&
    sendPort &&
    sendUser &&
    sendPassword &&
    receiveHost &&
    receivePort &&
    receiveUser &&
    receivePassword
  ) {
    const emailConfig = {
      send: {
        host: sendHost,
        port: sendPort,
        user: sendUser,
        password: sendPassword,
      },
      receive: {
        host: receiveHost,
        port: receivePort,
        user: receiveUser,
        password: receivePassword,
      },
    };

    try {
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
    } catch (err) {
      res.status(500).send("Error saving email configuration.");
    }
  } else {
    res.status(400).send("All fields are required.");
  }
});

app.get("/:pwd/finish", authMiddleware, (req, res) => {
  res.send(
    renderedTemplate({
      Title: "Setup finished",
      Context: `You have finished the setup. You can now login with the admin password: <code>${pwd}</code>. <br/> You can start the app by running npm start in the root folder.`,
      next: false,
      pwd: webpwd,
    })
  );
});

app.listen(port, () => {
  console.log(`Setup is running at http://localhost:${port}/${webpwd}`);
});

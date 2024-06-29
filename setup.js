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
      Title: "Welcome to OpenHelp Setup!",
      Context:
        "🚀 Welcome to the OpenHelp setup wizard! We're excited to guide you through the process of setting up your very own instance. This user-friendly webapp will walk you through each step, ensuring a smooth and hassle-free setup experience. Let's get started by creating a fresh database for your OpenHelp installation. Don't worry if you have an existing db.sqlite3 file - we'll take care of that for you. Ready to begin this exciting journey? Let's go!",
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
      Title: "Database Creation - Success!",
      Context:
        "🎉 Great news! We've successfully created a fresh database file for your OpenHelp instance. This is where all your important data will be stored securely. We've taken care of any existing files to ensure a clean slate for your new setup. You're making excellent progress - let's move on to the next exciting step!",
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
        Title: "Admin Account Created",
        Context: `🔐 Fantastic! We've set up your database and created an admin account to get you started. Your unique admin password is: <code>${pwd}</code>. Please make sure to save this password in a secure location - you'll need it to access your OpenHelp admin panel. Remember, keeping this password safe is crucial for the security of your instance. Great job on completing this important step!`,
        next: "step3",
        pwd: webpwd,
      })
    );
  });
});

app.get("/:pwd/step3", authMiddleware, (req, res) => {
  res.send(
    renderedTemplate({
      Title: "Email Configuration",
      Context:
        "📧 Now, let's set up your email configuration. This is an important step that will allow OpenHelp to send and receive emails, enabling smooth communication with your users. You'll need to provide details for both sending and receiving emails. Don't worry if you don't have this information handy - you can always update it later. Ready to make OpenHelp communication-ready? Let's go!",
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
          Title: "Email Setup Complete",
          Context:
            "✉️ Excellent work! Your email configuration has been successfully saved. OpenHelp is now ready to handle all your email communications seamlessly. This setup will ensure that your instance can send notifications, receive inquiries, and manage all email-related tasks efficiently. You're almost at the finish line - let's wrap this up!",
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
      Title: "Setup Complete - Congratulations!",
      Context: `🎊 Congratulations! You've successfully completed the OpenHelp setup process. Your instance is now ready to go! Here's a quick recap:

      1. Your database has been created and initialized.
      2. An admin account is set up with the password: <code>${pwd}</code>
      3. Email configurations have been saved.

      To start your OpenHelp instance, simply run 'npm start' in the root folder. We're excited for you to explore all the fantastic features OpenHelp has to offer. If you need any assistance, don't hesitate to consult our documentation or reach out to our support team. Happy helping!`,
      next: false,
      pwd: webpwd,
    })
  );
});

app.listen(port, () => {
  console.log(
    `🌟 OpenHelp Setup is running at http://localhost:${port}/${webpwd}`
  );
});

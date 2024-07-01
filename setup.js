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
        "<p>🚀 Welcome to the OpenHelp setup wizard! We're excited to guide you through the process of setting up your very own instance.</p>" +
        "<p>This user-friendly webapp will walk you through each step, ensuring a smooth and hassle-free setup experience. Let's get started by creating a fresh database for your OpenHelp installation.</p>" +
        "<p><strong>Note:</strong> Don't worry if you have an existing db.sqlite3 file - we'll take care of that for you.</p>" +
        "<p>Ready to begin this exciting journey? Let's go!</p>",
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
        "<p>🎉 Great news! We've successfully created a fresh database file for your OpenHelp instance.</p>" +
        "<p>This is where all your important data will be stored securely. We've taken care of any existing files to ensure a clean slate for your new setup.</p>" +
        "<p>You're making excellent progress - let's move on to the next exciting step!</p>",
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
      "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT, password TEXT, name TEXT, sign_in_date TEXT)",
      (err) => {
        if (err) {
          return res.status(500).send("Error creating table.");
        }
      }
    );

    db.run(
      "INSERT INTO users (username, password, name, sign_in_date) VALUES (?, ?, ?, ?)",
      ["admin", hashedPwd, "Admin User", new Date().toISOString()],
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
        Context:
          "<p>🔐 Fantastic! We've set up your database and created an admin account to get you started.</p>" +
          `<p>Your unique admin password is: <code>${pwd}</code></p>` +
          "<p><strong>Important:</strong> Please make sure to save this password in a secure location - you'll need it to access your OpenHelp admin panel.</p>" +
          "<p>Remember, keeping this password safe is crucial for the security of your instance.</p>" +
          "<p>Great job on completing this important step!</p>",
        next: "step2a",
        pwd: webpwd,
      })
    );
  });
});

// New step for generating and saving sessionKey
app.get("/:pwd/step2a", authMiddleware, (req, res) => {
  const sessionKey = generateRandomString(32);
  process.env.SESSION_KEY = sessionKey;

  // Save the session key to a .env file
  fs.appendFileSync(".env", `\nSESSION_KEY=${sessionKey}`);

  res.send(
    renderedTemplate({
      Title: "Session Key Generated",
      Context:
        "<p>🔑 Excellent! We've generated a secure session key for your cookies.</p>" +
        "<p>This key will be used to sign and encrypt session cookies, adding an extra layer of security to your OpenHelp instance.</p>" +
        "<p>The session key has been saved to your environment variables and added to your .env file for future use.</p>" +
        "<p>You're making great progress in securing your OpenHelp setup!</p>",
      next: "step3",
      pwd: webpwd,
    })
  );
});

app.get("/:pwd/step3", authMiddleware, (req, res) => {
  res.send(
    renderedTemplate({
      Title: "Email Configuration",
      Context: "",
      next: "step4",
      pwd: webpwd,
      form: true,
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
      // send email for test
      let transporter = nodemailer.createTransport({
        host: sendHost,
        port: sendPort,
        auth: {
          user: sendUser,
          pass: sendPassword,
        },
      });
      transporter.sendMail({
        from: sendUser,
        to: process.env.testemail,
        subject: "Test email",
        text: "This is a test email.",
      });
      res.send(
        renderedTemplate({
          Title: "Email Setup Complete",
          Context:
            "<p>✉️ Excellent work! Your email configuration has been successfully saved.</p>" +
            "<p>OpenHelp is now ready to handle all your email communications seamlessly. This setup will ensure that your instance can:</p>" +
            "<ul>" +
            "  <li>Send notifications</li>" +
            "  <li>Receive inquiries</li>" +
            "  <li>Manage all email-related tasks efficiently</li>" +
            "</ul>" +
            "<p>You're almost at the finish line - let's wrap this up!</p>",
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
      Context:
        "<h2>🎊 Congratulations!</h2>" +
        "<p>You've successfully completed the OpenHelp setup process. Your instance is now ready to go!</p>" +
        "<h3>Here's a quick recap:</h3>" +
        "<ol>" +
        "  <li>Your database has been created and initialized.</li>" +
        `  <li>An admin account is set up with the password: <code>${pwd}</code></li>` +
        "  <li>Email configurations have been saved.</li>" +
        "</ol>" +
        "<p>To start your OpenHelp instance, simply run <code>npm start</code> in the root folder.</p>" +
        "<p>We're excited for you to explore all the fantastic features OpenHelp has to offer. If you need any assistance, don't hesitate to consult our documentation or reach out to our support team.</p>" +
        "<h3>Happy helping! 🚀</h3>",
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

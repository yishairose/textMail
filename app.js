import express from "express";
import fs from "fs";
import open from "open";
import { google } from "googleapis";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { Vonage } from "@vonage/server-sdk";

const vonage = new Vonage({
  apiKey: "d6c59326",
  apiSecret: "nymgqSdHo3z8Gj3P",
});

dotenv.config();
const app = express();
app.use(express.json());
async function watchEmails(auth) {
  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.watch({
    userId: "me",
    requestBody: {
      labelIds: ["INBOX"],
      topicName: "projects/dumb-mail/topics/gmail-notifications",
    },
  });
  console.log(`Watching Mailbox: ${res.data}`);
}
app.listen(process.env.PORT || 3000, () =>
  console.log(`Listening on port: ${process.env.PORT || 3000}`)
);
app.get("/", (req, res) => {
  res.send("Hello World!");
});
app.get("/callback", (req, res) => {
  const code = req.query.code;

  oAuth2Client.getToken(code, async (err, token) => {
    if (err) {
      console.error("Error retrieving access token", err);
      return;
    }
    oAuth2Client.setCredentials(token);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(token)); // Save token to a file

    watchEmails(oAuth2Client);
    res.send("Authorization successful! You can now use the Gmail API.");
  });
});
app.get("/allMail", async (req, res) => {
  listEmails(oAuth2Client);
  res.send("Done");
});

const credentials = JSON.parse(fs.readFileSync("credentials.json"));

const oAuth2Client = new google.auth.OAuth2(
  credentials.web.client_id,
  credentials.web.client_secret,
  credentials.web.redirect_uris
);
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
];

// If the token is already saved, use it. Otherwise, generate it.
const TOKEN_PATH = "token.json";

// Check if token exists
fs.readFile(TOKEN_PATH, (err, token) => {
  if (err) return getNewToken(oAuth2Client); // If no token, get new one
  oAuth2Client.setCredentials(JSON.parse(token));
  watchEmails(oAuth2Client);
  // listEmails(oAuth2Client); // Fetch emails if token is available
});

// Get a new token by asking the user to authorize the app
function getNewToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  console.log("Authorize this app by visiting this url:", authUrl);
  open(authUrl, {
    newInstance: true,
    app: { name: "google chrome", arguments: ["--new-window"] },
  });
}
// List emails in the Gmail inbox
async function listEmails(auth) {
  const gmail = google.gmail({ version: "v1", auth });

  try {
    const res = await gmail.users.messages.list({
      userId: "me",
      labelIds: ["INBOX"],
      q: "is:unread", // Filter for unread emails
    });

    if (res.data.messages && res.data.messages.length) {
      console.log("Messages:");
      res.data.messages.forEach(async (message) => {
        const msg = await gmail.users.messages.get({
          userId: "me",
          id: message.id,
        });
        console.log(`- ${msg.data.snippet}`); // Preview the email content
      });
    } else {
      console.log("No unread messages found.");
    }
  } catch (err) {
    console.error("The API returned an error: " + err);
  }
}
let prevHistoryId = 0;
app.post("/gmail-webhook", async (req, res) => {
  try {
    const message = req.body.message;

    if (!message || !message.data) {
      return res.status(400).send("No message data");
    }

    // Decode the Pub/Sub message data (base64 encoded)
    const messageData = JSON.parse(
      Buffer.from(message.data, "base64").toString("utf-8")
    );
    // console.log("Received Pub/Sub message:", messageData);

    const historyId = messageData.historyId; // Extract historyId from the message

    await getMessage(oAuth2Client, prevHistoryId || historyId);

    prevHistoryId = historyId;
    // Respond with success
    res.status(200).send("OK");
  } catch (error) {
    console.error("Error handling Pub/Sub message:", error);
    res.status(500).send("Error");
  }
});

async function sendSMS(to, from, text) {
  await vonage.sms
    .send({ to, from, text })
    .then((resp) => {
      console.log("Message sent successfully");
      console.log(resp);
    })
    .catch((err) => {
      console.log("There was an error sending the messages.");
      console.error(err);
    });
}
async function getMessage(auth, historyId) {
  const gmail = google.gmail({ version: "v1", auth });

  try {
    const historyRes = await gmail.users.history.list({
      userId: "me",
      startHistoryId: historyId,
      historyTypes: ["messageAdded"], // Only include new messages
    });
    if (historyRes.data.history) {
      for (const historyRecord of historyRes.data.history) {
        if (historyRecord.messagesAdded) {
          for (const addedMessage of historyRecord.messagesAdded) {
            const messageId = addedMessage.message.id;

            // Step 2: Retrieve full message content using messageId
            const messageRes = await gmail.users.messages.get({
              userId: "me",
              id: messageId,
              format: "full",
            });
            // Extract sender and subject from headers
            const headers = messageRes.data.payload.headers;
            const from = headers.find((header) => header.name === "From").value;
            const subject = headers.find(
              (header) => header.name === "Subject"
            ).value;
            // console.log(messageRes.data.snippet);

            // // Extract main content from the body
            let mainContent = "";
            if (messageRes.data.payload.parts) {
              // Check for multiple parts and find the 'text/plain' or 'text/html' part
              const part = messageRes.data.payload.parts.find(
                (p) => p.mimeType === "text/plain"
              );
              mainContent = part
                ? Buffer.from(part.body.data, "base64").toString()
                : "";
            } else {
              // Single-part messageRes
              mainContent = Buffer.from(
                messageRes.data.payload.body.data,
                "base64"
              ).toString();
            }

            console.log(`From: ${from}`);
            console.log(`Subject: ${subject}`);
            console.log(`Main Content: ${mainContent}`);
            const fromName = "TextMail";
            const to = "447783951268";
            const text = `You have a new email!! From:${from}, Subject:${subject}, Body:${mainContent}`;

            await sendSMS(to, fromName, text);
          }
        }
      }
    } else {
      console.log("No new messages since the last historyId.");
    }
  } catch (error) {
    if (error.code === 404) {
      const profile = await gmail.users.getProfile({ userId: "me" });
      const startHistoryId = profile.data.historyId; // Reset to the latest ID
      await getMessage(oAuth2Client, startHistoryId);
    }
  }
}

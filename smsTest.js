import { Vonage } from "@vonage/server-sdk";

const vonage = new Vonage({
  apiKey: "d6c59326",
  apiSecret: "nymgqSdHo3z8Gj3P",
});

const from = "Vonage APIs";
const to = "447783951268";
const text = "A text message sent using the Vonage SMS API";

async function sendSMS() {
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

sendSMS();

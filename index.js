import * as line from '@line/bot-sdk'
import express from 'express'

// create LINE SDK config from env variables
const config = {
  channelSecret: "d3179805a1781261446611fe2f55e43c",
};

// create LINE SDK client
const client = line.LineBotClient.fromChannelAccessToken({
  channelAccessToken: "GcsuqTlQt0wy9ZogOzvVF0xM5JU7X/cRY4kQ120Ectdl/YfVhCz8438bc0iHMODyj750fWtEVNz6IYQE83/fRUL4gnd4ItBVTiRm+7E1EYXRzb3RTyuatpjAi8MZidfD6LrzgSYkdil/8t9PU3Yq4gdB04t89/1O/w1cDnyilFU="
});

// create Express app
// about Express itself: https://expressjs.com/
const app = express();

// register a webhook handler with middleware
// about the middleware, please refer to doc
app.post('/callback', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// event handler
function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    // ignore non-text-message event
    return Promise.resolve(null);
  }

  // create an echoing text message
  const echo = { type: 'text', text: event.message.text };

  // use reply API
  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [echo],
  });
}

// listen on port
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`listening on ${port}`);
});
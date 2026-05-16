// index.js
import * as line from '@line/bot-sdk'
import express from 'express'
import * as dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';


const app = express();
// create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);


// create LINE SDK config from env variables
const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

// create LINE SDK client
const client = line.LineBotClient.fromChannelAccessToken({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});


app.get('/', (req, res) => {
  res.send('hello world, Pemika fahxoxo fahxoxo auto auto');
});

const PORT = process.env.PORT || 3001;


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
const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`listening on ${port}`);
});
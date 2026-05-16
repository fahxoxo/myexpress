import * as line from '@line/bot-sdk'
import express from 'express'
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
dotenv.config();

const app = express();

// create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  //process.env.SUPABASE_KEY
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// create Gemini AI client
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });


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

// Gemini AI Functions
// Generate AI response for text messages
async function generateAIResponse(text) {
  try {
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: text
    });
    return result.text;
  } catch (error) {
    console.error('Gemini Text Error:', error);
    throw error;
  }
}

// Analyze image with Gemini Vision
async function analyzeImageWithGemini(imageData, mimeType) {
  try {
    // imageData ต้องเป็น base64 string
    let base64String = imageData;
    if (Buffer.isBuffer(imageData)) {
      base64String = imageData.toString('base64');
    }
    
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            data: base64String,
            mimeType: mimeType
          }
        },
        'ระบุว่านี่คือสัตว์ชนิดอะไร ให้คำตอบสั้น ๆ เป็นภาษาไทย'
      ]
    });
    return result.text;
  } catch (error) {
    console.error('Gemini Vision Error:', error);
    throw error;
  }
}

// event handler
// 4. ฟังก์ชันหลักในการจัดการ Event และบันทึกข้อมูล
async function handleEvent(event) {
  // รองรับเฉพาะ Event ประเภทข้อความ (Message Event) เท่านั้น
  if (event.type === "message" && event.message.type === "image") {
    return handleImageMessage(event);
  }


  const userId = event.source.userId || 'unknown';
  const replyToken = event.replyToken || '';
 
  // ดึงข้อมูลพื้นฐานจาก Message Object ของ LINE
  const messageId = event.message.id;
  const messageType = event.message.type; // text, image, sticker, video, etc.
 
  let content = null;
  let botReplyText = '';

  try {
    // ตรวจสอบเงื่อนไขตามประเภทข้อความ
    if (event.message.type === 'text') {
      content = event.message.text;
      console.log(`📝 Text Message from ${userId}: ${content}`);
      
      // เรียก Gemini AI เพื่อสร้างคำตอบ
      botReplyText = await generateAIResponse(content);
      console.log(`🤖 Gemini Response: ${botReplyText}`);
      
    } else if (event.message.type === 'image') {
      // ดึง image content จาก LINE
      const imageBuffer = await client.getMessageContent(messageId);
      
      console.log(`🖼️ Image Message from ${userId}`);
      
      // วิเคราะห์รูปภาพด้วย Gemini Vision
      content = `[Image: ${messageId}]`;
      botReplyText = await analyzeImageWithGemini(imageBuffer, 'image/jpeg');
      console.log(`🔍 Image Analysis: ${botReplyText}`);
      
    } else {
      // หากเป็นประเภทอื่น เช่น sticker, video
      content = `[Received ${messageType} message]`;
      botReplyText = `ได้รับข้อความประเภท ${messageType} แล้วครับ`;
      console.log(`📦 Other Message Type: ${messageType}`);
    }

    // บันทึกข้อมูลลงตาราง messages ใน Supabase (บันทึกคู่ทั้งคำถามและคำตอบที่เตรียมไว้)
    const { error } = await supabase
      .from('messages')
      .insert([
        {
          user_id: userId,
          message_id: messageId,
          type: messageType,
          content: content,
          reply_token: replyToken,
          reply_content: botReplyText
        }
      ]);

    if (error) {
      console.error('❌ Supabase Insert Error:', error.message);
    } else {
      console.log(`✅ Saved to Supabase: User=${userId}, Type=${messageType}`);
    }

    // ตอบกลับข้อความไปยังผู้ใช้ใน LINE
    return await client.replyMessage({
      replyToken: replyToken,
      messages: [
        {
          type: 'text',
          text: botReplyText,
        },
      ],
    });

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการประมวลผลระบบ:', error.message);
    
    // ส่งข้อความ error กลับไปให้ผู้ใช้
    try {
      return await client.replyMessage({
        replyToken: replyToken,
        messages: [
          {
            type: 'text',
            text: 'ขออภัย เกิดข้อผิดพลาดในการประมวลผล กรุณาลองใหม่อีกครั้ง',
          },
        ],
      });
    } catch (replyError) {
      console.error('❌ Failed to send error message:', replyError);
    }
  }
}


// listen on port
const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`listening on ${port}`);
});
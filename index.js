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
async function analyzeImageWithGemini(imageBuffer, mimeType) {
  try {
    // Ensure we have base64 string from Buffer
    const base64String = Buffer.isBuffer(imageBuffer) 
      ? imageBuffer.toString('base64')
      : imageBuffer;
    
    console.log(`📊 Image size: ${base64String.length} characters (base64)`);
    
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: 'ระบุว่านี่คือสัตว์ชนิดอะไร ให้คำตอบสั้น ๆ เป็นภาษาไทย'
            },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64String
              }
            }
          ]
        }
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
  if (event.type !== "message") return;

  const userId = event.source.userId || 'unknown';
  const replyToken = event.replyToken || '';
 
  // ดึงข้อมูลพื้นฐานจาก Message Object ของ LINE
  const messageId = event.message.id;
  const messageType = event.message.type; // text, image, sticker, video, etc.
 
  let content = null;
  let botReplyText = '';
  let imageUrl = null;

  try {
    // ตรวจสอบเงื่อนไขตามประเภทข้อความ
    if (event.message.type === 'text') {
      content = event.message.text;
      console.log(`📝 Text Message from ${userId}: ${content}`);
      
      // เรียก Gemini AI เพื่อสร้างคำตอบ
      botReplyText = await generateAIResponse(content);
      console.log(`🤖 Gemini Response: ${botReplyText}`);
      
    } else if (event.message.type === 'image') {
      console.log(`🖼️ Image Message from ${userId}`);
      
      // ดาวน์โหลดรูปภาพจาก LINE โดยใช้ lineBlobClient
      const imageStream = await lineBlobClient.getMessageContent(messageId);
      
      // แปลง stream เป็น Buffer
      let imageBuffer;
      if (imageStream.arrayBuffer) {
        const arrayBuffer = await imageStream.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuffer);
      } else {
        // Handle as stream
        const chunks = [];
        for await (const chunk of imageStream) {
          chunks.push(chunk);
        }
        imageBuffer = Buffer.concat(chunks);
      }
      
      // วิเคราะห์รูปภาพด้วย Gemini Vision
      content = `[Image: ${messageId}]`;
      botReplyText = await analyzeImageWithGemini(imageBuffer, 'image/jpeg');
      console.log(`🔍 Image Analysis: ${botReplyText}`);
      
      // อัปโหลดรูปภาพไปยัง Supabase Storage
      imageUrl = await uploadImageToStorage(messageId, imageBuffer);
      console.log(`📤 Image uploaded: ${imageUrl}`);
      
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
          reply_content: botReplyText,
          image_url: imageUrl
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

// 1. สร้าง Blob Client สำหรับดึงข้อมูลไฟล์โดยเฉพาะ (ของ v9+)
const lineBlobClient = new line.messagingApi.MessagingApiBlobClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
});

const downloadLineContent = async (messageId) => {
  const stream = await lineBlobClient.getMessageContent(messageId);
  const chunks = [];
 
  // รองรับทั้งแบบ Blob (มี arrayBuffer) และแบบ Stream
  if (stream.arrayBuffer) {
    const arrayBuffer = await stream.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return {
      inlineData: {
        data: buffer.toString('base64'),
        mimeType: stream.type || 'image/jpeg'
      },
      buffer: buffer
    };
  } else {
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    return {
      inlineData: {
        data: buffer.toString('base64'),
        mimeType: 'image/jpeg'
      },
      buffer: buffer
    };
  }
};
// Function to upload image to Supabase Storage
async function uploadImageToStorage(messageId, imageBuffer) {
  try {
    const fileName = `${messageId}.jpg`;
    
    console.log(`🔄 Uploading image: ${fileName}`);

    // Upload without upsert flag to avoid RLS issues
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('uploads')
      .upload(`images/${fileName}`, imageBuffer, {
        contentType: 'image/jpeg'
      });

    if (uploadError) {
      console.error('❌ Storage Upload Error:', uploadError.message);
      return null;
    }

    // Get public URL
    const { data: publicUrlData } = supabase
      .storage
      .from('uploads')
      .getPublicUrl(`images/${fileName}`);

    return publicUrlData.publicUrl;

  } catch (error) {
    console.error('❌ Error uploading image:', error.message);
    return null;
  }
}


// listen on port
const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`listening on ${port}`);
});
import Koa from "koa";
import route from "koa-router";
import cors from 'koa2-cors';
import { PassThrough } from 'stream';
import crypto from "crypto";
import bodyParser from "koa-bodyparser";
import xmlParser from "./middleware/koaXmlParser.js";
import ChatGpt from "./lib/chatgpt.js";
import { request } from './utils/http.js';
import fs from 'fs';

import dotenv from 'dotenv';
import path from "path";

dotenv.config();

const APPID = process.env.WECHAT_APP_ID;
const APPSECRET = process.env.WECHAT_APP_SECRET;

const app = new Koa();
const router = route();
const chatGptClient: any = new ChatGpt();

// 微信配置
const webchatToken = "reaiWechat";
const MSG_ID_CHAT_MAP = {};

// 获取access_token
async function getAccessToken() {
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${APPSECRET}`;
  try {
    const res: any = await request({ url, method: 'get' });
    const { access_token } = res.data || {};
    return access_token
  }catch(error) {
    throw(error);
  }
}

// 主动发信息给用户
async function sendTextToUser(params: any) {
  const { toUser, content } = params || {};
  const accessToken = await getAccessToken();
  const url = `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${accessToken}`;
  const data = {
    touser: toUser,
    msgtype: "text",
    text: {
      content: content || '',
    }
  }
  try {
    const res: any = await request({ url, method: 'post', data });
    console.log(res.data);
  } catch (error) {
    console.log('send fail');
  }
}

// 跨域设置
app.use(
  cors({
    origin: (ctx) => "*",
    exposeHeaders: ["WWW-Authenticate", "Server-Authorization"],
    maxAge: 5,
    credentials: true,
    allowMethods: ["GET", "POST", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization", "Accept"],
  })
);

// 验证
router.get("/api/wx/reply", async (ctx) => {
  const { signature, timestamp, nonce, echostr } = ctx.query;
  let hash = crypto.createHash("sha1");
  const arr = [webchatToken, timestamp, nonce].sort();
  hash.update(arr.join(""));
  const shasum = hash.digest("hex");
  console.log(signature)
  if (shasum === signature) {
    return (ctx.body = echostr);
  }
  ctx.status = 401;
  ctx.body = "Invalid signature";
});

// 消息回复
router.post("/api/wx/reply", async (ctx) => {
  let { ToUserName, FromUserName, Content, MsgType, MsgId } = ctx.request.body.xml;
  ToUserName = ToUserName && ToUserName[0];
  FromUserName = FromUserName && FromUserName[0];
  Content = Content && Content[0];
  MsgType = MsgType && MsgType[0];
  MsgId = MsgId && MsgId[0];
  try {
    // 防止重复发送
    if(!MSG_ID_CHAT_MAP[MsgId]) {

      const question = (Content || "").trim();

      console.log('question:', question);

      MSG_ID_CHAT_MAP[MsgId] = 1;

      let reply = await chatGptClient.sendMessageToChatGpt(question, {
        id: ToUserName,
      });
      
      console.log('reply:', reply);

      if(MSG_ID_CHAT_MAP[MsgId]) {
        delete MSG_ID_CHAT_MAP[MsgId];
        ctx.xmlSend({
          toUserName: ToUserName,
          toFromName: FromUserName,
          type: MsgType,
          content: reply,
        });
      }else {
        sendTextToUser({ toUser: FromUserName, content: reply });
      }

    } else {

      delete MSG_ID_CHAT_MAP[MsgId];

      ctx.body = '';
    }
  } catch (error) {
    console.log(error);
    ctx.xmlSend({
      toUserName: ToUserName,
      toFromName: FromUserName,
      type: MsgType,
      content: error,
    });
  }
});

// 发送消息
const sendMessage = async (stream) => {
  const data = [
    '现在科学技术的发展速度叫人惊叹',
    '同样在数码相机的技术创新上',
    '随着数码相机越来越普及',
    '数码相机现已成为大家生活中不可缺少的电子产品',
    '而正是因为这样，技术的创新也显得尤为重要',
  ].map(c => c.split("")).flat(10);

  // 循环上面数组: 推送数据、休眠 2 秒
  for (const value of data) {
    stream.write(`${value}`); // 写入数据(推送数据)
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // 结束流
  stream.end();
};

// 流式输出方式
router.get("/stream/reply", (ctx) => {
  const { q } = ctx.query;

  ctx.set({
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
    'Content-Type': 'text/event-stream; charset=utf-8',
  });

  const stream = new PassThrough(); 

  ctx.body = stream;
  ctx.status = 200;

  chatGptClient.sendMessageToChatGpt(q, { id: 'test-chatgpt' }, (txt) => {
    stream.write(txt); 
  }).then(res => {
    stream.end();
  }).catch(err => {
    stream.end();
  })

})

app
  .use(xmlParser())
  .use(router.routes())
  .use(router.allowedMethods());
app.listen(80);
console.log("Server listen in:" + 80);

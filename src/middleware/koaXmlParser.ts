import xmlParser from "koa-xml-body";

export default () => async (ctx, next) => {
  ctx.xmlSend = (params?: any) => {
    const { toFromName, toUserName, createTime, msgId, type, content } = params;
    return ctx.body = `<xml>
      <ToUserName><![CDATA[${toFromName}]]></ToUserName>
      <FromUserName><![CDATA[${toUserName }]]></FromUserName>
      <CreateTime>${createTime || +new Date()}</CreateTime>
      <MsgType><![CDATA[${type || 'text'}]]></MsgType>
      <Content><![CDATA[${(content || '').replace(/`+/g, '\n')}]]></Content>
      </xml>`
  };
  return xmlParser()(ctx, next);
}
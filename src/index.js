const Koa = require("koa");
const KoaRouter = require("koa-router");
const axios = require("axios");
const bodyParser = require("koa-bodyparser")
const { wx_url, appid, secret } = require("./config");
// 微信提供的解密代码
var WXBizDataCrypt = require('./utils/WXBizDataCrypt')

const app = new Koa();
app.use(bodyParser())

const loginRouter = new KoaRouter({ prefix: "/login" });
loginRouter.post("/", async (ctx) => {
  /**
   * ❕❕❕❕❕临时登录凭证 code 只能使用一次，code的有效期为五分钟，五分钟之内没用换取openid、unionid、session_key 等信息，这个code就失效果了
   * ❕❕❕❕❕openid、unionid、session_key 等信息是长效信息
   */
  // 获取前端传来的code
  const { code } = ctx.request.body;
  // 使用code，请求微信api获取openid和session_key
  // 需要用到appid，secret（在和获取appid相同的位置获得），secret是小程序密钥，需要小程序通过公众号验证之后才能获取，个人小程序是没有这个密钥的
  const { data } = await axios.get(wx_url, {
    params: {
      appid,
      secret,
      js_code: code,
      grant_type: "authorization_code", // 微信规定要求使用这个类型来请求wx_url('https://api.weixin.qq.com/sns/jscode2session')的时候, 微信服务器才认为这是获取session_key和openid的请求
    },
  });

  // 返回的data中会包含两个值，一个是openid，另一个就是session_key，session_key是一个钥匙，通过这个钥匙配合小程序的提供的库，可以做很多小程序的解密工作
  // 如果不需要关联到自己的存储服务的话，openid就可以唯一标识一个用户了，不需要session_key
  // const { session_key, openid } = data;

  /**
   * ❕❕❕❕❕会话密钥 session_key 是对用户数据进行 加密签名 的密钥。为了应用自身的数据安全，开发者服务器不应该把会话密钥下发到小程序，也不应该对外提供这个密钥。
   * ❕❕❕❕❕临时登录凭证 code 只能使用一次，code的有效期为五分钟，五分钟之内没用换取openid、unionid、session_key 等信息，这个code就失效果了
   * ❕❕❕❕❕openid、unionid、session_key 等信息是长效信息
   */

  // 这里为了省事，所以把session_key和openid返回给客户端
  const session = JSON.stringify(data)
  ctx.body = {
    data: {
      session,
    },
  };
});

const phoneRouter = new KoaRouter({ prefix: "/getPhoneNumber" });
phoneRouter.post("/", async (ctx) => {
  const { encryptedData, iv, session } = ctx.request.body;
  // 从token中解析出session_key, openid
  const {session_key, openid} = JSON.parse(session);


  // 使用微信提供的包进行解密操作，获取用户的手机号
  var pc = new WXBizDataCrypt(appid, session_key)
  var data = pc.decryptData(encryptedData , iv)
  // data样板如下
  /**
   * {
   *     "phoneNumber": "13580006666",
   *     "purePhoneNumber": "13580006666",
   *     "countryCode": "86",
   *     "watermark":
   *     {
   *         "appid":"APPID",
   *         "timestamp": TIMESTAMP
   *     }
   * }
   */


  const {phoneNumber, countryCode} = data

  if(phoneNumber) {
    // 如果data中能解析出手机号
    // 去存储服务中查找这个手机号注册过没有？
    // 如果没有
    ctx.body = {
      data: {
        code: 404,
        msg: "没有注册"
      }
    }
    // 如果注册了，就要进入下一个中间件————我们后端的登陆的中间件，给前端返回一个我们自己服务器使用jwt生成的token，而不是小程序之前提供的session
    await next()
  }
});

app.use(loginRouter.routes());
app.use(phoneRouter.routes());

app.listen(9012, "0.0.0.0", () => {
  console.log("listening in 9012");
});

require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Telegraf, session } = require('telegraf');
const axios = require('axios');

// ======== إعدادات البيئة ========
const ADMIN_BOT_TOKEN = process.env.ADMIN_BOT_TOKEN || '8874334419:AAFqjEpoE2W-Euq2HXtqJU2KPbfm3isjUnc';
const USER_BOT_TOKEN = process.env.USER_BOT_TOKEN || '8994191558:AAFeIW-3G1PnEoxoLDVPE1dtiKImsPDQq8c';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '8243764053';
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || 'https://capitanostore-production.up.railway.app';

// ======== بوت الأدمن ========
const adminBot = new Telegraf(ADMIN_BOT_TOKEN);

// ======== إعداد رفع الصور ========
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// ======== إعداد خادم Express ========
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ======== دالة إرسال الطلب للأدمن ========
async function sendOrderToAdmin(game, pack, price, accountId, notes, filePath, source = 'الموقع') {
  try {
    const caption = `🛍️ طلب شحن جديد (${source})
━━━━━━━━━━━━━━━
🎮 اللعبة: ${game}
📦 الباقة: ${pack}
💰 السعر: ${price} ج.م
🆔 الحساب: ${accountId}
📝 ملاحظات: ${notes || 'لا يوجد'}
⏰ الوقت: ${new Date().toLocaleString('ar-EG')}
━━━━━━━━━━━━━━━
📌 رقم التحويل: 01036732010 (فودافون كاش)`;

    await adminBot.telegram.sendPhoto(ADMIN_CHAT_ID, {
      source: fs.createReadStream(filePath)
    }, {
      caption: caption,
      parse_mode: 'Markdown'
    });
    return true;
  } catch (error) {
    console.error('فشل الإرسال للأدمن:', error);
    return false;
  }
}

// ======== نقطة استقبال الطلبات من الموقع ========
app.post('/api/submit', upload.single('screenshot'), async (req, res) => {
  console.log('📨 تم استلام طلب جديد:', req.body);
  const { game, pack, price, account_id, notes } = req.body;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ success: false, message: '⚠️ لازم ترفع السكرين شوت!' });
  }
  if (!account_id || account_id.trim() === '') {
    return res.status(400).json({ success: false, message: '⚠️ لازم تكتب الـ ID!' });
  }

  const sent = await sendOrderToAdmin(
    game,
    pack,
    price,
    account_id,
    notes,
    file.path,
    '🌐 الموقع الإلكتروني'
  );

  try { fs.unlinkSync(file.path); } catch(e) {}

  if (sent) {
    res.json({ success: true, message: `✅ تم استلام طلب ${game} بنجاح!` });
  } else {
    res.status(500).json({ success: false, message: '❌ عطل في الإرسال، جرب تاني.' });
  }
});

// ======== بوت الخدمة (العميل) ========
const userBot = new Telegraf(USER_BOT_TOKEN);
userBot.use(session());

// بيانات الألعاب (مختصرة للبوت)
const GAMES_DATA = {
  'PUBG': { packs: [{ label: '60 UC', price: 55 }, { label: '300+25 UC', price: 245 }, { label: '600+60 UC', price: 485 }, { label: '1500+300 UC', price: 1210 }] },
  'FC Mobile': { packs: [{ label: '40+8 Points', price: 30 }, { label: '100+20 Points', price: 70 }, { label: '520+104 Points', price: 270 }, { label: '1070+214 Points', price: 520 }] },
  'Call of Duty': { packs: [{ label: '30 CP', price: 30 }, { label: '80 CP', price: 55 }, { label: '420 CP', price: 260 }, { label: '880 CP', price: 510 }] },
  'Blood Strike MAX': { packs: [{ label: '50+1 Golds', price: 30 }, { label: '100+5 Golds', price: 55 }, { label: '300+20 Golds', price: 150 }, { label: '500+40 Golds', price: 240 }, { label: '1000+100 Golds', price: 470 }] },
  'Free Fire': { packs: [{ label: '100 D', price: 65 }, { label: '210 D', price: 120 }, { label: '530 D', price: 280 }, { label: '1080 D', price: 555 }] },
  'Telegram Stars': { packs: [{ label: '75 Stars', price: 80 }, { label: '100 Stars', price: 115 }, { label: '150 Stars', price: 155 }, { label: '250 Stars', price: 250 }, { label: '350 Stars', price: 335 }, { label: '500 Stars', price: 470 }, { label: '750 Stars', price: 700 }, { label: 'Premium 3 Months', price: 745 }] }
};

// دالة عرض الألعاب
const gamesKeyboard = () => {
  const buttons = Object.keys(GAMES_DATA).map(game => {
    return [{ text: `🎮 ${game}`, callback_data: `game_${game}` }];
  });
  buttons.push([{ text: '🔗 افتح الموقع', url: BASE_URL }]);
  return { inline_keyboard: buttons };
};

// دالة عرض الباقات
const packsKeyboard = (gameKey) => {
  const game = GAMES_DATA[gameKey];
  const buttons = game.packs.map(pack => {
    return [{ text: `${pack.label} (${pack.price} ج.م)`, callback_data: `pack_${gameKey}_${pack.label}_${pack.price}` }];
  });
  buttons.push([{ text: '🔙 رجوع', callback_data: 'back_home' }]);
  return { inline_keyboard: buttons };
};

// أمر /start
userBot.start(async (ctx) => {
  ctx.session = {};
  await ctx.reply(
    `🔥 مرحباً بك في *Capitano Store*!
أقوى متجر شحن للألعاب.

📌 اختر اللعبة من الأزرار:`,
    { parse_mode: 'Markdown', reply_markup: gamesKeyboard() }
  );
});

// اختيار اللعبة
userBot.action(/game_(.*)/, async (ctx) => {
  const gameKey = ctx.match[1];
  ctx.session.game = gameKey;
  await ctx.answerCbQuery();
  await ctx.reply(
    `✅ اخترت: *${gameKey}*
اختر الباقة:`,
    { parse_mode: 'Markdown', reply_markup: packsKeyboard(gameKey) }
  );
});

// اختيار الباقة
userBot.action(/pack_(.*)_(.*)_(.*)/, async (ctx) => {
  ctx.session.pack = ctx.match[2];
  ctx.session.price = ctx.match[3];
  await ctx.answerCbQuery();
  await ctx.reply(
    `💰 اخترت باقة *${ctx.session.pack}* بسعر *${ctx.session.price}* ج.م.
📝 اكتب الـ ID أو اليوزرنيم في رسالة منفصلة.
(ممكن تكتب ملاحظاتك معاه)`,
    { parse_mode: 'Markdown' }
  );
  ctx.session.step = 'waiting_id';
});

// رجوع
userBot.action('back_home', async (ctx) => {
  ctx.session = {};
  await ctx.answerCbQuery();
  await ctx.reply('🔙 رجعت للقائمة:', { reply_markup: gamesKeyboard() });
});

// استقبال النصوص (ID + ملاحظات)
userBot.on('text', async (ctx) => {
  if (ctx.session.step === 'waiting_id') {
    ctx.session.account_id = ctx.message.text;
    ctx.session.step = 'waiting_screenshot';
    await ctx.reply(
      `📸 خطوة أخيرة:
1️⃣ حول المبلغ *${ctx.session.price}* ج.م على فودافون كاش: *01036732010*
2️⃣ ارفع صورة التحويل.

⚠️ تأكد من ظهور المبلغ والرقم.`,
      { parse_mode: 'Markdown' }
    );
  } else {
    await ctx.reply('استخدم الأزرار أو اكتب /start');
  }
});

// استقبال الصور
userBot.on('photo', async (ctx) => {
  if (ctx.session.step !== 'waiting_screenshot') {
    return ctx.reply('⚠️ ابدأ طلب جديد بـ /start');
  }

  const photo = ctx.message.photo[ctx.message.photo.length - 1];
  const fileLink = await ctx.telegram.getFileLink(photo.file_id);
  const response = await axios({ url: fileLink.href, responseType: 'stream' });
  const tempPath = `./uploads/temp_${Date.now()}.jpg`;
  const writer = fs.createWriteStream(tempPath);
  response.data.pipe(writer);
  await new Promise((resolve) => writer.on('finish', resolve));

  await sendOrderToAdmin(
    ctx.session.game,
    ctx.session.pack,
    ctx.session.price,
    ctx.session.account_id,
    'تم الإرسال عبر البوت',
    tempPath,
    '🤖 بوت التليجرام'
  );

  try { fs.unlinkSync(tempPath); } catch(e) {}

  await ctx.reply('✅ تم استلام طلبك بنجاح! سيتم الارسال بعد التأكيد', {
    reply_markup: { inline_keyboard: [[{ text: '🔗 افتح الموقع', url: BASE_URL }]] }
});
  ctx.session = {};
});

// ======== تشغيل السيرفر والبوتات ========
app.listen(PORT, () => {
  console.log(`🌐 موقع Capitano Store شغال على http://localhost:${PORT}`);
});

userBot.launch().then(() => console.log('🤖 بوت الخدمة شغال.'));
adminBot.launch().then(() => console.log('🤖 بوت الأدمن شغال.'));

process.once('SIGINT', () => { userBot.stop('SIGINT'); adminBot.stop('SIGINT'); });
process.once('SIGTERM', () => { userBot.stop('SIGTERM'); adminBot.stop('SIGTERM'); });

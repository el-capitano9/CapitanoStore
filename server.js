require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Telegraf } = require('telegraf');
const axios = require('axios');

// ======== إعدادات البيئة (اعملها في Railway لاحقاً) ========
const ADMIN_BOT_TOKEN = process.env.ADMIN_BOT_TOKEN || '8874334419:AAFqjEpoE2W-Euq2HXtqJU2KPbfm3isjUnc';
const USER_BOT_TOKEN = process.env.USER_BOT_TOKEN || '8994191558:AAFeIW-3G1PnEoxoLDVPE1dtiKImsPDQq8c';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '8243764053';
const PORT = process.env.PORT || 3000;

// ======== بوت الأدمن (لإرسال الصور لك) ========
const adminBot = new Telegraf(ADMIN_BOT_TOKEN);

// ======== إعداد رفع الصور للموقع ========
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

// ======== دالة إرسال الطلب للأدمن (من الموقع أو البوت) ========
async function sendOrderToAdmin(game, pack, price, accountId, filePath, source = 'الموقع') {
  try {
    const caption = `🛍️ طلب شحن جديد (${source})
━━━━━━━━━━━━━━━
🎮 اللعبة: ${game}
📦 الباقة: ${pack}
💰 السعر: ${price} ج.م
🆔 الحساب (ID/Username): ${accountId}
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
  const { game, pack, price, account_id } = req.body;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ success: false, message: '⚠️ لازم ترفع السكرين شوت!' });
  }
  if (!account_id || account_id.trim() === '') {
    return res.status(400).json({ success: false, message: '⚠️ لازم تكتب الـ ID أو اليوزرنيم!' });
  }

  const sent = await sendOrderToAdmin(
    game,
    pack,
    price,
    account_id,
    file.path,
    '🌐 الموقع الإلكتروني'
  );

  // مسح الصورة من السيرفر بعد الإرسال لتوفير المساحة
  try { fs.unlinkSync(file.path); } catch(e) {}

  if (sent) {
    res.json({ success: true, message: `✅ تم استلام طلب ${game} بنجاح! هنتواصل معاك قريباً.` });
  } else {
    res.status(500).json({ success: false, message: '❌ عطل في الإرسال، جرب تاني أو تواصل مع الدعم.' });
  }
});

// ======== بوت الخدمة (بديل الموقع - لكل اللاعبين) ========
const userBot = new Telegraf(USER_BOT_TOKEN);

// قائمة الألعاب والأسعار (زي ما طلبت بالضبط)
const GAMES_DATA = {
  'PUBG': {
    icon: '🪂',
    packs: [
      { label: '60 UC', price: 55 },
      { label: '300+25 UC', price: 245 },
      { label: '600+60 UC', price: 485 },
      { label: '1500+300 UC', price: 1210 }
    ],
    field_label: '🆔 الـ ID الخاص بك'
  },
  'FC Mobile': {
    icon: '⚽',
    packs: [
      { label: '40+8 Points', price: 30 },
      { label: '100+20 Points', price: 70 },
      { label: '520+104 Points', price: 270 },
      { label: '1070+214 Points', price: 520 }
    ],
    field_label: '🆔 الـ ID الخاص بك'
  },
  'Call of Duty': {
    icon: '🔫',
    packs: [
      { label: '30 CP', price: 30 },
      { label: '80 CP', price: 55 },
      { label: '420 CP', price: 260 },
      { label: '880 CP', price: 510 }
    ],
    field_label: '🆔 الـ ID الخاص بك'
  },
  'Blood Strike MAX': {
    icon: '🧛',
    packs: [
      { label: '50+1 Golds', price: 30 },
      { label: '100+5 Golds', price: 55 },
      { label: '300+20 Golds', price: 150 },
      { label: '500+40 Golds', price: 240 },
      { label: '1000+100 Golds', price: 470 }
    ],
    field_label: '🆔 الـ ID الخاص بك'
  },
  'Free Fire': {
    icon: '🔥',
    packs: [
      { label: '100 D', price: 65 },
      { label: '210 D', price: 120 },
      { label: '530 D', price: 280 },
      { label: '1080 D', price: 555 }
    ],
    field_label: '🆔 الـ ID الخاص بك'
  },
  'Telegram Stars': {
    icon: '⭐',
    packs: [
      { label: '75 Stars', price: 80 },
      { label: '100 Stars', price: 115 },
      { label: '150 Stars', price: 155 },
      { label: '250 Stars', price: 250 },
      { label: '350 Stars', price: 335 },
      { label: '500 Stars', price: 470 },
      { label: '750 Stars', price: 700 },
      { label: 'Premium 3 Months', price: 745 }
    ],
    field_label: '👤 اليوزرنيم (Username) الخاص بك'
  }
};

// دالة عرض الألعاب (الخطوة الأولى)
const gamesKeyboard = () => {
  const buttons = Object.keys(GAMES_DATA).map(game => {
    const icon = GAMES_DATA[game].icon;
    return [{ text: `${icon} ${game}`, callback_data: `game_${game}` }];
  });
  // تقسيمهم في صفوف (كل لعبة في سطر لوحدها)
  return { inline_keyboard: buttons };
};

// دالة عرض الباقات (الخطوة الثانية)
const packsKeyboard = (gameKey) => {
  const game = GAMES_DATA[gameKey];
  const buttons = game.packs.map(pack => {
    return [{ text: `${pack.label} (${pack.price} ج.م)`, callback_data: `pack_${gameKey}_${pack.label}_${pack.price}` }];
  });
  buttons.push([{ text: '🔙 رجوع للقائمة الرئيسية', callback_data: 'back_home' }]);
  return { inline_keyboard: buttons };
};

// أمر /start
userBot.start(async (ctx) => {
  ctx.session = {}; // reset
  await ctx.reply(
    `🔥 مرحباً بك في *Capitano Store*!
أقوى متجر شحن للألعاب ونجوم تيليجرام.

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
الآن اختر الباقة المناسبة:`,
    { parse_mode: 'Markdown', reply_markup: packsKeyboard(gameKey) }
  );
});

// اختيار الباقة
userBot.action(/pack_(.*)_(.*)_(.*)/, async (ctx) => {
  const gameKey = ctx.match[1];
  const packLabel = ctx.match[2];
  const packPrice = ctx.match[3];
  
  ctx.session.pack = packLabel;
  ctx.session.price = packPrice;
  
  await ctx.answerCbQuery();
  
  const fieldLabel = GAMES_DATA[gameKey].field_label;
  await ctx.reply(
    `💰 اخترت باقة *${packLabel}* بسعر *${packPrice}* ج.م.
📝 من فضلك اكتب ${fieldLabel} في رسالة منفصلة.
(مثال: 123456789 أو @username)`,
    { parse_mode: 'Markdown' }
  );
  ctx.session.step = 'waiting_id';
});

// رجوع للخلف
userBot.action('back_home', async (ctx) => {
  ctx.session = {};
  await ctx.answerCbQuery();
  await ctx.reply('🔙 رجعت للقائمة الرئيسية:', { reply_markup: gamesKeyboard() });
});

// استقبال النصوص (الـ ID أو اليوزرنيم)
userBot.on('text', async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith('/')) return;

  if (ctx.session.step === 'waiting_id') {
    if (!text || text.trim() === '') {
      return ctx.reply('⚠️ من فضلك اكتب الـ ID أو اليوزرنيم بشكل صحيح.');
    }
    ctx.session.account_id = text.trim();
    ctx.session.step = 'waiting_screenshot';
    
    await ctx.reply(
      `📸 خطوة أخيرة:
1️⃣ حول المبلغ *${ctx.session.price}* ج.م على رقم فودافون كاش: *01036732010*
2️⃣ اضغط على أيقونة 📎 (المشبك) وارفع ليا صورة (سكرين شوت) للتحويل.

⚠️ تأكد أن الصورة واضحة وتظهر المبلغ والرقم المحول منه.`,
      { parse_mode: 'Markdown' }
    );
  } else {
    await ctx.reply('⚠️ استخدم الأزرار للتنقل، أو اكتب /start');
  }
});

// استقبال الصور (السكرين شوت)
userBot.on('photo', async (ctx) => {
  if (ctx.session.step !== 'waiting_screenshot') {
    return ctx.reply('⚠️ من فضلك ابدأ طلب جديد بـ /start أولاً.');
  }

  const photo = ctx.message.photo[ctx.message.photo.length - 1];
  const fileLink = await ctx.telegram.getFileLink(photo.file_id);
  
  // تحميل الصورة مؤقتاً
  const response = await axios({ url: fileLink.href, responseType: 'stream' });
  const tempPath = `./uploads/temp_${Date.now()}.jpg`;
  const writer = fs.createWriteStream(tempPath);
  response.data.pipe(writer);
  await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });

  // إرسال الطلب للأدمن
  const sent = await sendOrderToAdmin(
    ctx.session.game,
    ctx.session.pack,
    ctx.session.price,
    ctx.session.account_id,
    tempPath,
    '🤖 بوت التليجرام'
  );

  // مسح الملف المؤقت
  try { fs.unlinkSync(tempPath); } catch(e) {}

  if (sent) {
    await ctx.reply('✅ تم استلام طلبك بنجاح! هنتواصل معاك قريباً على هذا الشات.');
  } else {
    await ctx.reply('❌ حدث عطل في الإرسال، حاول تاني أو استخدم الموقع الإلكتروني.');
  }
  ctx.session = {};
});

// ======== تشغيل السيرفر والبوتات ========
app.listen(PORT, () => {
  console.log(`🌐 موقع Capitano Store شغال على http://localhost:${PORT}`);
});

userBot.launch().then(() => console.log('🤖 بوت الخدمة (بديل الموقع) شغال.'));
adminBot.launch().then(() => console.log('🤖 بوت الأدمن شغال.'));

process.once('SIGINT', () => { userBot.stop('SIGINT'); adminBot.stop('SIGINT'); });
process.once('SIGTERM', () => { userBot.stop('SIGTERM'); adminBot.stop('SIGTERM'); });

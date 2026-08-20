require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Telegraf, session, Markup } = require('telegraf');
const axios = require('axios');

// Environment Configurations
const ADMIN_BOT_TOKEN = process.env.ADMIN_BOT_TOKEN || '8874334419:AAFqjEpoE2W-Euq2HXtqJU2KPbfm3isjUnc';
const USER_BOT_TOKEN = process.env.USER_BOT_TOKEN || '8994191558:AAFeIW-3G1PnEoxoLDVPE1dtiKImsPDQq8c';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '8243764053';
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || 'https://capitanostore-production.up.railway.app';

// Ensure uploads dir
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
}

// Maintenance File Path & Logic
const MAINTENANCE_FILE = path.join(__dirname, 'maintenance.json');

function getMaintenanceState() {
  try {
    if (fs.existsSync(MAINTENANCE_FILE)) {
      return JSON.parse(fs.readFileSync(MAINTENANCE_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('❌ خطأ في قراءة ملف الصيانة:', e);
  }
  return { bot: false, web: false };
}

function setMaintenanceState(state) {
  try {
    fs.writeFileSync(MAINTENANCE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {
    console.error('❌ خطأ في كتابة ملف الصيانة:', e);
  }
}

// Multer Storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './uploads'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`)
});
const upload = multer({ storage });

// Initialize Express App
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Telegraf Admin Bot & User Bot
const adminBot = new Telegraf(ADMIN_BOT_TOKEN);
const userBot = new Telegraf(USER_BOT_TOKEN);
userBot.use(session());

// Middleware - Check Bot Maintenance
userBot.use(async (ctx, next) => {
  const maint = getMaintenanceState();
  if (maint.bot) {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('⚠️ البوت تحت الصيانة حالياً', { show_alert: true });
    }
    return ctx.reply('البوت تحت الصيانة يرجي الانتظار وعدم الطلب حاليا');
  }
  return next();
});

// Detailed Games Catalog
const GAMES_CATALOG = {
  'pubg': {
    name: 'PUBG Mobile 🔫',
    packs: [
      { label: '60 UC', price: 60 },
      { label: '300+25 UC', price: 245 },
      { label: '600+60 UC', price: 485 },
      { label: '1500+300 UC', price: 1215 }
    ]
  },
  'fcmobile': {
    name: 'EA SPORTS FC Mobile ⚽',
    packs: [
      { label: '48 FC Points', price: 30 },
      { label: '120 FC Points', price: 70 },
      { label: '624 FC Points', price: 270 },
      { label: '1284 FC Points', price: 520 }
    ]
  },
  'cod': {
    name: 'Call of Duty Mobile 💣',
    packs: [
      { label: '30 CP', price: 30 },
      { label: '80 CP', price: 55 },
      { label: '420 CP', price: 260 },
      { label: '880 CP', price: 510 }
    ]
  },
  'bloodstrike': {
    name: 'Blood Strike 🎯',
    packs: [
      { label: '50+1 Golds', price: 30 },
      { label: '100+5 Golds', price: 55 },
      { label: '300+20 Golds', price: 150 },
      { label: '500+40 Golds', price: 240 },
      { label: '1000+100 Golds', price: 470 }
    ]
  },
  'freefire': {
    name: 'Free Fire 🔥',
    packs: [
      { label: '100 Diamonds', price: 65 },
      { label: '210 Diamonds', price: 120 },
      { label: '530 Diamonds', price: 280 },
      { label: '1080 Diamonds', price: 555 }
    ]
  },
  'telegram': {
    name: 'Telegram Stars ⭐️',
    packs: [
      { label: '75 Stars', price: 80 },
      { label: '100 Stars', price: 115 },
      { label: '250 Stars', price: 250 },
      { label: '500 Stars', price: 470 },
      { label: '750 Stars', price: 700 },
      { label: 'Premium 3 Months', price: 745 }
    ]
  }
};

// Send Order Notification to Admin
async function sendOrderToAdmin(orderData) {
  const { game, pack, price, accountId, notes, filePath, source, userTelegramId } = orderData;
  const time = new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' });

  const caption = 
`🛍️ *طلب شحن جديد!*
━━━━━━━━━━━━━━━━━━
🎮 *اللعبة:* ${game}
📦 *الباقة:* ${pack}
💰 *المبلغ:* ${price} ج.م
🆔 *معرف الحساب:* \`${accountId}\`
📝 *ملاحظات:* ${notes || 'لا يوجد'}
🌐 *المصدر:* ${source}
⏰ *الوقت:* ${time}
━━━━━━━━━━━━━━━━━━
💳 *رقم المحفظة:* \`01036732010\``;

  const inlineKeyboard = [];
  if (userTelegramId) {
    inlineKeyboard.push([
      Markup.button.callback('✅ قبول وإشعار العميل', `approve_${userTelegramId}`),
      Markup.button.callback('❌ رفض الطلب', `reject_${userTelegramId}`)
    ]);
  }

  // Add Maintenance Control Button to Admin Notification
  inlineKeyboard.push([
    Markup.button.callback('⚙️ لوحة التحكم بالصيانة', 'admin_maint_menu')
  ]);

  try {
    await adminBot.telegram.sendPhoto(ADMIN_CHAT_ID, { source: fs.createReadStream(filePath) }, {
      caption,
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(inlineKeyboard)
    });
    return true;
  } catch (error) {
    console.error('❌ فشل إرسال الطلب للأدمن:', error);
    return false;
  }
}

// Admin Maintenance Menu Handler Helper
async function sendMaintenanceMenu(ctx) {
  const maint = getMaintenanceState();
  const text = `⚙️ *لوحة التحكم في حالة الصيانة*

🤖 *البوت:* ${maint.bot ? '🔴 متوقف (تحت الصيانة)' : '🟢 يعمل بنجاح'}
🌐 *الموقع:* ${maint.web ? '🔴 متوقف (تحت الصيانة)' : '🟢 يعمل بنجاح'}

اختر الإجراء المطلوب لتغيير حالة النظام:`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback(`${maint.bot ? '🟢 تشغيل البوت' : '🔴 إيقاف البوت (صيانة)'}`, 'toggle_maint_bot')],
    [Markup.button.callback(`${maint.web ? '🟢 تشغيل الموقع' : '🔴 إيقاف الموقع (صيانة)'}`, 'toggle_maint_web')],
    [Markup.button.callback(`${(maint.bot && maint.web) ? '🟢 تشغيل الاثنين' : '⛔ إيقاف الاثنين (صيانة)'}`, 'toggle_maint_both')],
    [Markup.button.callback('❌ إغلاق', 'close_maint_menu')]
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard }).catch(async () => {
      await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
    });
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
  }
}

// Admin Commands & Actions
adminBot.command(['maintenance', 'admin'], async (ctx) => {
  await sendMaintenanceMenu(ctx);
});

adminBot.action('admin_maint_menu', async (ctx) => {
  await ctx.answerCbQuery();
  await sendMaintenanceMenu(ctx);
});

adminBot.action('toggle_maint_bot', async (ctx) => {
  const maint = getMaintenanceState();
  maint.bot = !maint.bot;
  setMaintenanceState(maint);
  await ctx.answerCbQuery(`تم ${maint.bot ? 'تفعيل' : 'إلغاء'} صيانة البوت ✅`);
  await sendMaintenanceMenu(ctx);
});

adminBot.action('toggle_maint_web', async (ctx) => {
  const maint = getMaintenanceState();
  maint.web = !maint.web;
  setMaintenanceState(maint);
  await ctx.answerCbQuery(`تم ${maint.web ? 'تفعيل' : 'إلغاء'} صيانة الموقع ✅`);
  await sendMaintenanceMenu(ctx);
});

adminBot.action('toggle_maint_both', async (ctx) => {
  const maint = getMaintenanceState();
  const target = !(maint.bot && maint.web);
  maint.bot = target;
  maint.web = target;
  setMaintenanceState(maint);
  await ctx.answerCbQuery(`تم ${target ? 'تفعيل' : 'إلغاء'} صيانة البوت والموقع معاً ✅`);
  await sendMaintenanceMenu(ctx);
});

adminBot.action('close_maint_menu', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.deleteMessage().catch(() => {});
});

// Admin Action Buttons Callbacks (Approve / Reject)
adminBot.action(/approve_(.*)/, async (ctx) => {
  const targetUserId = ctx.match[1];
  try {
    await userBot.telegram.sendMessage(targetUserId, `🎉 *مبروك! تم إكمال طلب الشحن الخاص بك بنجاح.* \nشكراً لثقتك بـ Capitano Store! ❤️`, { parse_mode: 'Markdown' });
    await ctx.answerCbQuery('تم إشعار العميل بالإكمال ✅');
    await ctx.editMessageCaption(`${ctx.callbackQuery.message.caption}\n\n✅ *حالة الطلب: تم القبول والتنفيذ.*`);
  } catch (e) {
    await ctx.answerCbQuery('تعذر المراسلة.');
  }
});

adminBot.action(/reject_(.*)/, async (ctx) => {
  const targetUserId = ctx.match[1];
  try {
    await userBot.telegram.sendMessage(targetUserId, `❌ *تنبيه:* اعتذر، تم رفض طلبك. يرجى التأكد من بيانات التحويل وإعادة الطلب مرة أخرى أو التواصل معنا.`, { parse_mode: 'Markdown' });
    await ctx.answerCbQuery('تم إشعار العميل بالرفض ❌');
    await ctx.editMessageCaption(`${ctx.callbackQuery.message.caption}\n\n❌ *حالة الطلب: تم الرفض.*`);
  } catch (e) {
    await ctx.answerCbQuery('تعذر المراسلة.');
  }
});

// Website Status API Route
app.get('/api/status', (req, res) => {
  const maint = getMaintenanceState();
  res.json({ success: true, maintenance: maint });
});

// Website API Route
app.post('/api/submit', upload.single('screenshot'), async (req, res) => {
  try {
    const maint = getMaintenanceState();
    if (maint.web) {
      return res.status(503).json({ success: false, message: 'الموقع تحت الصيانة يرجي الانتظار وعدم الطلب حاليا' });
    }

    const { game, pack, price, account_id, notes } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ success: false, message: 'برجاء إرفاق صورة التحويل!' });
    if (!account_id) return res.status(400).json({ success: false, message: 'برجاء أدخال معرف الحساب الـ ID!' });

    const sent = await sendOrderToAdmin({
      game, pack, price, accountId: account_id, notes, filePath: file.path, source: '🌐 الموقع الإلكتروني'
    });

    // Remove file after sending
    setTimeout(() => { try { fs.unlinkSync(file.path); } catch(e){} }, 5000);

    if (sent) {
      res.json({ success: true, message: 'تم استلام طلبك بنجاح وسيتواصل معك الفريق فور التنفيذ!' });
    } else {
      res.status(500).json({ success: false, message: 'حدث خطأ أثناء معالجة الطلب، حاول مرة أخرى.' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'عطل بالسيرفر.' });
  }
});

// User Telegram Bot Logic
userBot.start(async (ctx) => {
  ctx.session = {};
  const buttons = Object.keys(GAMES_CATALOG).map(key => [
    Markup.button.callback(GAMES_CATALOG[key].name, `select_game_${key}`)
  ]);
  buttons.push([Markup.button.url('🌐 فتح الموقع الإلكتروني', BASE_URL)]);

  await ctx.reply(
    `🔥 *أهلاً بك في CAPITANO STORE* \nأفضل وأسرع متجر لشحن الألعاب والخدمات digital.\n\n👇 اختر اللعبة المطلوب شحنها:`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
  );
});

// Cancel command
userBot.command('cancel', async (ctx) => {
  ctx.session = {};
  await ctx.reply('❌ تم إلغاء العملية. اضغط /start للبدء من جديد.');
});

// Game Selection Callback
userBot.action(/select_game_(.*)/, async (ctx) => {
  const gameKey = ctx.match[1];
  const game = GAMES_CATALOG[gameKey];
  ctx.session = { gameKey, gameName: game.name, step: 'SELECT_PACK' };

  const buttons = game.packs.map((p, idx) => [
    Markup.button.callback(`${p.label} - (${p.price} ج.م)`, `select_pack_${idx}`)
  ]);
  buttons.push([Markup.button.callback('🔙 القائمة الرئيسية', 'main_menu')]);

  await ctx.answerCbQuery();
  await ctx.reply(`🎯 اختر الباقة المناسبة لـ *${game.name}*:`, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
});

// Pack Selection Callback
userBot.action(/select_pack_(.*)/, async (ctx) => {
  const packIndex = parseInt(ctx.match[1]);
  const game = GAMES_CATALOG[ctx.session.gameKey];
  const selectedPack = game.packs[packIndex];

  ctx.session.pack = selectedPack.label;
  ctx.session.price = selectedPack.price;
  ctx.session.step = 'AWAITING_ID';

  await ctx.answerCbQuery();
  await ctx.reply(
    `📝 *خطوة (2/3):* أرسل الآن *معرف الحساب (ID)* الخاص بك في اللعبة:\n\n_(يمكنك إرسال أي ملاحظات إضافية مع الـ ID في نفس الرسالة)_`,
    { parse_mode: 'Markdown' }
  );
});

// Main Menu Callback
userBot.action('main_menu', async (ctx) => {
  ctx.session = {};
  await ctx.answerCbQuery();
  const buttons = Object.keys(GAMES_CATALOG).map(key => [
    Markup.button.callback(GAMES_CATALOG[key].name, `select_game_${key}`)
  ]);
  buttons.push([Markup.button.url('🌐 فتح الموقع الإلكتروني', BASE_URL)]);
  await ctx.reply('👇 اختر اللعبة من القائمة:', Markup.inlineKeyboard(buttons));
});

// Handle Text input for Account ID
userBot.on('text', async (ctx) => {
  if (ctx.session && ctx.session.step === 'AWAITING_ID') {
    ctx.session.accountId = ctx.message.text;
    ctx.session.step = 'AWAITING_RECEIPT';

    await ctx.reply(
      `💳 *خطوة الدفع والتأكيد الأخيرة:*
━━━━━━━━━━━━━━━━━━
💰 المبلغ المطلوب تحويله: *${ctx.session.price} ج.م*
📱 رقم فودافون كاش: \`01036732010\`
━━━━━━━━━━━━━━━━━━
📸 أرسل صورة إيصال التحويل (Screenshot) الآن لإكمال الطلب.`,
      { parse_mode: 'Markdown' }
    );
  } else {
    await ctx.reply('اضغط على /start لبدء طلب شحن جديد.');
  }
});

// Handle Photo Upload
userBot.on('photo', async (ctx) => {
  if (!ctx.session || ctx.session.step !== 'AWAITING_RECEIPT') {
    return ctx.reply('⚠️ يرجى البدء أولاً واختيار اللعبة عبر /start');
  }

  const msg = await ctx.reply('⏳ جاري إرسال ومعالجة إيصال التحويل...');

  try {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);

    const tempPath = `./uploads/bot_${Date.now()}.jpg`;
    const response = await axios({ url: fileLink.href, responseType: 'stream' });
    const writer = fs.createWriteStream(tempPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    await sendOrderToAdmin({
      game: ctx.session.gameName,
      pack: ctx.session.pack,
      price: ctx.session.price,
      accountId: ctx.session.accountId,
      notes: 'طلب عبر بوت التليجرام الآلي',
      filePath: tempPath,
      source: `🤖 بوت التليجرام (@${ctx.from.username || ctx.from.first_name})`,
      userTelegramId: ctx.from.id
    });

    try { fs.unlinkSync(tempPath); } catch(e){}

    await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id);
    await ctx.reply('🎉 *تم استلام طلبك بنجاح!* \nسوف تتلقى إشعاراً هنا في المحادثة فور إتمام الشحن بالحساب.', { parse_mode: 'Markdown' });
    ctx.session = {};
  } catch (err) {
    console.error(err);
    await ctx.reply('❌ حدث خطأ أثناء رفع الصورة، حاول مرة أخرى.');
  }
});

// Start Express Server
app.listen(PORT, () => console.log(`🚀 Capitano Store Server Running on Port ${PORT}`));

// Launch Bots
userBot.launch().then(() => console.log('🤖 User Telegram Bot Connected.'));
adminBot.launch().then(() => console.log('🛡️ Admin Telegram Bot Connected.'));

process.once('SIGINT', () => { userBot.stop('SIGINT'); adminBot.stop('SIGINT'); });
process.once('SIGTERM', () => { userBot.stop('SIGTERM'); adminBot.stop('SIGTERM'); });

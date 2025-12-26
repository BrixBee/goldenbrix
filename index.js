// ============================================
// GOLDENBRIX BOT - MAIN CODE
// The World's First Tipping Publicist
// Built on TON blockchain
// ============================================

// ============================================
// CONFIGURATION
// ============================================

// Your Telegram user ID for admin access
// Get this from @userinfobot
const ADMIN_USER_ID = 8471405863; // Replace with your actual ID

// ============================================
// HELPER FUNCTIONS
// ============================================

// Send request to Telegram Bot API
async function sendTelegramRequest(method, body, env) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return response.json();
}

// Generate unique payment code
function generatePaymentCode() {
  return 'GB-' + Math.random().toString(36).substring(2, 9).toUpperCase();
}

// Calculate boost fee based on tip amount
function calculateBoostFee(tipAmount) {
  if (tipAmount < 10) return 0.50;
  if (tipAmount < 50) return 1.00;
  if (tipAmount < 100) return 2.00;
  if (tipAmount < 500) return tipAmount * 0.02; // 2%
  return Math.min(tipAmount * 0.01, 10.00); // 1%, max $10
}

// Detect user type based on amount
function detectUserType(amount) {
  return amount >= 100 ? 'professional' : 'casual';
}

// ============================================
// COMMAND HANDLERS
// ============================================

// /start command - Welcome & onboarding
async function handleStart(chatId, userId, username, env, startParam = null) {
  // Check for deep link (button click)
  if (startParam && startParam.startsWith('gb_')) {
    return handleDeepLink(chatId, userId, username, startParam, env);
  }
  
  // Check if user exists in database
  const user = await env.DB.prepare(
    'SELECT * FROM users WHERE telegram_id = ?'
  ).bind(userId).first();
  
  if (!user) {
    // Create new user
    await env.DB.prepare(
      'INSERT INTO users (telegram_id, username) VALUES (?, ?)'
    ).bind(userId, username || 'user').run();
  }
  
  const message = `🏆 Welcome to GoldenBrix!

The world's first Tipping Publicist on Telegram.

✨ What is a Golden Brix?
A 24-hour public celebration when you tip a creator:
• 24-hour spotlight in ${env.CHANNEL_USERNAME}
• Leaderboard recognition as "Architect"
• Public testimonial (5,000+ views)

💰 How it works:
1. Tap a Golden Brix button below any creator's content
2. @wallet opens with pre-filled payment
3. Confirm in one tap
4. Automatic 24-hour celebration!

🏗️ Commands:
/golden @creator 10 - Create Golden Brix (or use buttons!)
/foundation - View leaderboards
/stats - Your stats
/button - Generate buttons for your content
/help - Show this message

Build careers. One Golden Brix at a time. 🧱`;

  await sendTelegramRequest('sendMessage', {
    chat_id: chatId,
    text: message,
    parse_mode: 'Markdown'
  }, env);
}

// Handle deep links from buttons
async function handleDeepLink(chatId, userId, username, startParam, env) {
  // Parse: gb_creator_10
  const parts = startParam.split('_');
  
  if (parts.length !== 3) {
    return handleStart(chatId, userId, username, env);
  }
  
  const creatorUsername = parts[1];
  const amount = parseFloat(parts[2]);
  
  if (amount === 'custom' || isNaN(amount)) {
    await sendTelegramRequest('sendMessage', {
      chat_id: chatId,
      text: '💰 Enter your custom amount (e.g., 15):'
    }, env);
    return;
  }
  
  // Automatically trigger Golden Brix creation
  await handleGolden(chatId, userId, [`@${creatorUsername}`, amount.toString()], env);
}

// /golden command - Main feature (BACKUP - buttons are primary)
async function handleGolden(chatId, userId, args, env) {
  // Parse: /golden @creator 10
  if (args.length < 2) {
    return sendTelegramRequest('sendMessage', {
      chat_id: chatId,
      text: '❌ Usage: /golden @creator 10\n\nTip: It\'s easier to use buttons! Creators can add Golden Brix buttons to their posts using /button'
    }, env);
  }
  
  const creatorUsername = args[0].replace('@', '');
  const tipAmount = parseFloat(args[1]);
  
  if (isNaN(tipAmount) || tipAmount < 0.01) {
    return sendTelegramRequest('sendMessage', {
      chat_id: chatId,
      text: '❌ Tip amount must be at least $0.01'
    }, env);
  }
  
  const boostFee = calculateBoostFee(tipAmount);
  const paymentCode = generatePaymentCode();
  
  // Get creator from database (or create if doesn't exist)
  let creator = await env.DB.prepare(
    'SELECT * FROM users WHERE username = ?'
  ).bind(creatorUsername).first();
  
  if (!creator) {
    // Create placeholder creator
    const result = await env.DB.prepare(
      'INSERT INTO users (telegram_id, username) VALUES (?, ?)'
    ).bind(0, creatorUsername).run();
    
    creator = { id: result.meta.last_row_id, username: creatorUsername };
  }
  
  // Create payment request
  const expiresAt = Math.floor(Date.now() / 1000) + (15 * 60); // 15 min
  
  await env.DB.prepare(`
    INSERT INTO payment_requests 
    (code, supporter_id, creator_id, tip_amount, boost_fee, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    paymentCode,
    userId,
    creator.id,
    tipAmount,
    boostFee,
    expiresAt
  ).run();
  
  // Generate payment instructions with button
  const message = `🏆 Ready to Golden Brix @${creatorUsername}!

💰 Tip Amount: $${tipAmount.toFixed(2)} USDT
✨ Golden Brix Boost: $${boostFee.toFixed(2)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📱 STEP 1: Send Tip to Creator
Open @wallet and send **$${tipAmount.toFixed(2)} USDT** (TON) to:
👤 @${creatorUsername}

📱 STEP 2: Add Golden Brix Boost
Send **$${boostFee.toFixed(2)} USDT** (TON) to:
💰 ${env.GOLDENBRIX_BOOST_ADDRESS}

⚠️ IMPORTANT: In the memo field, write:
\`${paymentCode}\`

This code links both payments to your Golden Brix.

⏱️ Complete within 15 minutes
🔍 We'll detect payments automatically

💡 What you get:
✅ 24-hour spotlight (${env.CHANNEL_USERNAME})
✅ Leaderboard ranking (The Foundation)
✅ Public testimonial (5,000+ views)

Questions? /help`;

  await sendTelegramRequest('sendMessage', {
    chat_id: chatId,
    text: message,
    parse_mode: 'Markdown'
  }, env);
}

// /button command - Generate creator buttons
async function handleButton(chatId, userId, args, env) {
  // Get user's username
  const user = await env.DB.prepare(
    'SELECT username FROM users WHERE telegram_id = ?'
  ).bind(userId).first();
  
  if (!user || !user.username) {
    return sendTelegramRequest('sendMessage', {
      chat_id: chatId,
      text: '❌ You need a Telegram username to create buttons.\n\nSet one in Settings → Username'
    }, env);
  }
  
  // Parse amounts (optional custom amounts)
  const amounts = args.length > 0 ? args : ['5', '10', '25'];
  
  const message = `🎨 Your Golden Brix Buttons

Copy this text and post in your channel/group/posts:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If this content helped you, Golden Brix me! 🏆

Every Golden Brix supporter gets featured for 24 hours.

${amounts.map(amt => `[🧱 Golden Brix $${amt}](https://t.me/${env.TELEGRAM_BOT_TOKEN.split(':')[0]}?start=gb_${user.username}_${amt})`).join(' ')}

[💰 Custom Amount](https://t.me/${env.TELEGRAM_BOT_TOKEN.split(':')[0]}?start=gb_${user.username}_custom)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 Tips:
• Buttons work in any Telegram chat
• Supporters click → bot opens → pre-filled payment
• You get both tip + public testimonial!

📊 Your Golden Brix stats: /stats
🏗️ Leaderboards: /foundation`;

  await sendTelegramRequest('sendMessage', {
    chat_id: chatId,
    text: message,
    parse_mode: 'Markdown'
  }, env);
}

// /foundation command - Leaderboards
async function handleFoundation(chatId, env) {
  // Casual Track - Architects
  const casualArchitects = await env.DB.prepare(`
    SELECT u.username, l.golden_brix_sent, l.total_sent_amount
    FROM leaderboards l
    JOIN users u ON l.user_id = u.id
    WHERE l.track = 'casual' AND l.golden_brix_sent > 0
    ORDER BY l.golden_brix_sent DESC, l.total_sent_amount DESC
    LIMIT 10
  `).all();
  
  // Casual Track - Builders
  const casualBuilders = await env.DB.prepare(`
    SELECT u.username, l.golden_brix_received, l.total_received_amount
    FROM leaderboards l
    JOIN users u ON l.user_id = u.id
    WHERE l.track = 'casual' AND l.golden_brix_received > 0
    ORDER BY l.golden_brix_received DESC, l.total_received_amount DESC
    LIMIT 10
  `).all();
  
  // Professional Track - Architects
  const proArchitects = await env.DB.prepare(`
    SELECT u.username, l.golden_brix_sent, l.total_sent_amount
    FROM leaderboards l
    JOIN users u ON l.user_id = u.id
    WHERE l.track = 'professional' AND l.golden_brix_sent > 0
    ORDER BY l.total_sent_amount DESC
    LIMIT 10
  `).all();
  
  // Professional Track - Builders
  const proBuilders = await env.DB.prepare(`
    SELECT u.username, l.golden_brix_received, l.total_received_amount
    FROM leaderboards l
    JOIN users u ON l.user_id = u.id
    WHERE l.track = 'professional' AND l.golden_brix_received > 0
    ORDER BY l.total_received_amount DESC
    LIMIT 10
  `).all();
  
  let message = `🏗️ THE FOUNDATION LEADERBOARDS

Updated: ${new Date().toLocaleDateString()}

═══════════════════════════════════
📱 CASUAL TRACK (Tips & Support)
═══════════════════════════════════

🏗️ TOP ARCHITECTS (Most Golden Brix Sent):
`;

  if (casualArchitects.results.length === 0) {
    message += '\nNo architects yet. Be the first! /golden @creator 5\n';
  } else {
    casualArchitects.results.forEach((user, idx) => {
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
      message += `\n${medal} @${user.username}`;
      message += `\n   ${user.golden_brix_sent} Golden Brix | $${user.total_sent_amount.toFixed(0)}`;
    });
  }
  
  message += `\n\n🧱 TOP BUILDERS (Most Golden Brix Received):`;
  
  if (casualBuilders.results.length === 0) {
    message += '\nNo builders yet. Create content & get Golden Brixed!\n';
  } else {
    casualBuilders.results.forEach((user, idx) => {
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
      message += `\n${medal} @${user.username}`;
      message += `\n   ${user.golden_brix_received} Golden Brix | $${user.total_received_amount.toFixed(0)}`;
    });
  }
  
  message += `\n\n═══════════════════════════════════
💼 PROFESSIONAL TRACK (Invoices $100+)
═══════════════════════════════════

🏗️ TOP ARCHITECTS (Most Volume):
`;

  if (proArchitects.results.length === 0) {
    message += '\nNo professional architects yet.\n';
  } else {
    proArchitects.results.forEach((user, idx) => {
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
      message += `\n${medal} @${user.username}`;
      message += `\n   ${user.golden_brix_sent} projects | $${user.total_sent_amount.toFixed(0)}`;
    });
  }
  
  message += `\n\n🧱 TOP BUILDERS (Most Earned):`;
  
  if (proBuilders.results.length === 0) {
    message += '\nNo professional builders yet.\n';
  } else {
    proBuilders.results.forEach((user, idx) => {
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
      message += `\n${medal} @${user.username}`;
      message += `\n   ${user.golden_brix_received} projects | $${user.total_received_amount.toFixed(0)}`;
    });
  }
  
  message += `\n\nWant to climb? Tap any Golden Brix button!`;
  
  await sendTelegramRequest('sendMessage', {
    chat_id: chatId,
    text: message
  }, env);
}

// /stats command - Personal statistics
async function handleStats(chatId, userId, env) {
  const stats = await env.DB.prepare(`
    SELECT 
      COALESCE(SUM(CASE WHEN supporter_id = (SELECT id FROM users WHERE telegram_id = ?) THEN 1 ELSE 0 END), 0) as sent,
      COALESCE(SUM(CASE WHEN supporter_id = (SELECT id FROM users WHERE telegram_id = ?) THEN tip_amount ELSE 0 END), 0) as sent_amount,
      COALESCE(SUM(CASE WHEN creator_id = (SELECT id FROM users WHERE telegram_id = ?) THEN 1 ELSE 0 END), 0) as received,
      COALESCE(SUM(CASE WHEN creator_id = (SELECT id FROM users WHERE telegram_id = ?) THEN tip_amount ELSE 0 END), 0) as received_amount
    FROM golden_brix
  `).bind(userId, userId, userId, userId).first();
  
  const message = `📊 Your Foundation Stats

🏗️ As Architect (Supporter):
• Golden Brix Sent: ${stats.sent}
• Total Supported: $${stats.sent_amount.toFixed(2)}

🧱 As Builder (Creator):
• Golden Brix Received: ${stats.received}
• Total Earned: $${stats.received_amount.toFixed(2)}

Keep building! Use /button to add Golden Brix buttons to your content.`;

  await sendTelegramRequest('sendMessage', {
    chat_id: chatId,
    text: message
  }, env);
}

// ============================================
// ADMIN COMMANDS
// ============================================

// /admin command - Admin dashboard
async function handleAdmin(chatId, userId, env) {
  if (userId !== ADMIN_USER_ID) {
    return sendTelegramRequest('sendMessage', {
      chat_id: chatId,
      text: '❌ Admin access only'
    }, env);
  }
  
  const stats = await env.DB.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM users) as total_users,
      (SELECT COUNT(*) FROM golden_brix) as total_golden_brix,
      (SELECT COALESCE(SUM(tip_amount), 0) FROM golden_brix) as total_volume,
      (SELECT COALESCE(SUM(boost_fee), 0) FROM golden_brix) as total_revenue,
      (SELECT COUNT(*) FROM golden_brix WHERE created_at > strftime('%s', 'now', '-24 hours')) as golden_brix_24h,
      (SELECT COUNT(*) FROM payment_requests WHERE expires_at > strftime('%s', 'now')) as pending_requests
  `).first();
  
  const message = `🔧 GOLDENBRIX ADMIN PANEL

📊 Overall Stats:
• Total Users: ${stats.total_users || 0}
• Total Golden Brix: ${stats.total_golden_brix || 0}
• Total Volume: $${(stats.total_volume || 0).toFixed(2)}
• Total Revenue: $${(stats.total_revenue || 0).toFixed(2)}

📈 Last 24 Hours:
• Golden Brix: ${stats.golden_brix_24h || 0}
• Pending Requests: ${stats.pending_requests || 0}

🛠️ Commands:
/announce [message] - Post to channel
/expireclean - Clean expired requests

Status: ✅ Online`;

  await sendTelegramRequest('sendMessage', {
    chat_id: chatId,
    text: message
  }, env);
}

// /announce command - Post announcement to channel
async function handleAnnounce(chatId, userId, args, env) {
  if (userId !== ADMIN_USER_ID) return;
  
  const message = args.join(' ');
  
  if (!message) {
    return sendTelegramRequest('sendMessage', {
      chat_id: chatId,
      text: '❌ Usage: /announce Your message here'
    }, env);
  }
  
  await sendTelegramRequest('sendMessage', {
    chat_id: env.CHANNEL_USERNAME,
    text: message,
    parse_mode: 'Markdown'
  }, env);
  
  await sendTelegramRequest('sendMessage', {
    chat_id: chatId,
    text: '✅ Announced to channel'
  }, env);
}

// /expireclean command - Clean expired payment requests
async function handleExpireClean(chatId, userId, env) {
  if (userId !== ADMIN_USER_ID) return;
  
  const result = await env.DB.prepare(
    'DELETE FROM payment_requests WHERE expires_at < ?'
  ).bind(Math.floor(Date.now() / 1000)).run();
  
  await sendTelegramRequest('sendMessage', {
    chat_id: chatId,
    text: `✅ Cleaned ${result.meta.changes || 0} expired requests`
  }, env);
}

// ============================================
// PAYMENT DETECTION SYSTEM
// ============================================

// Check TON transactions for an address
async function checkTONTransactions(address, env) {
  try {
    const url = `${env.TON_API}/getTransactions?address=${address}&limit=20`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.ok || !data.result) {
      return [];
    }
    
    return data.result;
  } catch (error) {
    console.error('Error checking TON transactions:', error);
    return [];
  }
}

// Parse USDT transactions from TON transactions
function parseUSDTTransactions(transactions) {
  const usdtTransactions = [];
  
  for (const tx of transactions) {
    try {
      if (tx.in_msg && tx.in_msg.message) {
        const message = tx.in_msg.message;
        
        // Look for USDT jetton transfer
        if (message.includes('USDT') || message.includes('transfer')) {
          usdtTransactions.push({
            hash: tx.transaction_id.hash,
            from: tx.in_msg.source,
            to: tx.in_msg.destination,
            amount: parseFloat(tx.in_msg.value) / 1000000,
            memo: message,
            timestamp: tx.utime
          });
        }
      }
    } catch (e) {
      continue;
    }
  }
  
  return usdtTransactions;
}

// Match payment to pending request
async function matchPayment(tx, env) {
  // Extract payment code from memo
  const codeMatch = tx.memo.match(/GB-[A-Z0-9]{7}/);
  if (!codeMatch) return null;
  
  const code = codeMatch[0];
  
  // Find pending payment request
  const request = await env.DB.prepare(
    'SELECT * FROM payment_requests WHERE code = ? AND expires_at > ?'
  ).bind(code, Math.floor(Date.now() / 1000)).first();
  
  if (!request) return null;
  
  // Check if this is tip or boost payment
  const isBoost = tx.to === env.GOLDENBRIX_BOOST_ADDRESS;
  const expectedAmount = isBoost ? request.boost_fee : request.tip_amount;
  
  // Amount must match (within 0.01 tolerance for rounding)
  if (Math.abs(tx.amount - expectedAmount) > 0.01) {
    return null;
  }
  
  // Update payment request
  if (isBoost) {
    await env.DB.prepare(
      'UPDATE payment_requests SET boost_paid = 1, boost_tx_hash = ? WHERE id = ?'
    ).bind(tx.hash, request.id).run();
  } else {
    await env.DB.prepare(
      'UPDATE payment_requests SET tip_paid = 1, tip_tx_hash = ? WHERE id = ?'
    ).bind(tx.hash, request.id).run();
  }
  
  // Check if BOTH payments complete
  const updated = await env.DB.prepare(
    'SELECT * FROM payment_requests WHERE id = ?'
  ).bind(request.id).first();
  
  if (updated.tip_paid && updated.boost_paid) {
    return updated; // Both payments complete!
  }
  
  return null;
}

// ============================================
// ANNOUNCEMENT TEMPLATES
// ============================================

// Get random announcement template
function getAnnouncementTemplate(supporter, creator, amount, supporterStats, creatorStats, type) {
  const templates = type === 'professional' ? professionalTemplates : casualTemplates;
  const template = templates[Math.floor(Math.random() * templates.length)];
  
  return template(supporter, creator, amount, supporterStats, creatorStats);
}

// Casual templates (for tips < $100)
const casualTemplates = [
  // Template 1: Standard
  (s, c, amt, sStats, cStats) => `✨🏆 GOLDEN BRIX SPOTLIGHT 🏆✨

@${s.username} just Golden Brixed @${c.username}!

💰 Amount: $${amt.toFixed(2)} USDT (TON)
💬 Building careers together!

📊 @${c.username}'s Foundation:
• Golden Brix Received: ${cStats.total_received || 0}
• Total Supported: $${(cStats.total_amount || 0).toFixed(0)}

🌟 @${s.username}'s Architect Stats:
• Golden Brix Given: ${sStats.total_sent || 0}
• Total Support: $${(sStats.total_amount || 0).toFixed(0)}

Want this spotlight? Use Golden Brix buttons!
👉 t.me/GoldenBrix_Bot

⏱️ Pinned for 24 hours`,

  // Template 2: Community Focus
  (s, c, amt, sStats, cStats) => `🧱 NEW BRICK IN THE FOUNDATION! 🧱

@${s.username} → @${c.username}: $${amt.toFixed(2)}

This is what building together looks like! 🏗️

📈 @${c.username} Progress:
✓ ${cStats.total_received || 0} Golden Brix
✓ $${(cStats.total_amount || 0).toFixed(0)} total support
✓ Foundation growing stronger! 💪

🎯 @${s.username} Impact:
✓ ${sStats.total_sent || 0} creators supported
✓ $${(sStats.total_amount || 0).toFixed(0)} total given
✓ True Architect of The Foundation! 🏆

Join The Foundation: t.me/GoldenBrix_Bot

⏱️ Featured for 24 hours`,

  // Template 3: Motivational
  (s, c, amt, sStats, cStats) => `💫 GENEROSITY SPOTLIGHT 💫

@${s.username} believes in @${c.username}!

💰 Golden Brix: $${amt.toFixed(2)} USDT

"Every great career is built one brick at a time. 
This is one of those bricks." 🧱

🎨 @${c.username}'s Journey:
• ${cStats.total_received || 0} Golden Brix milestones
• ${cStats.total_amount ? `$${cStats.total_amount.toFixed(0)} in support` : 'Just getting started!'}

💝 @${s.username}'s Generosity:
• ${sStats.total_sent || 0} creators empowered
• ${sStats.total_amount ? `$${sStats.total_amount.toFixed(0)} invested in dreams` : 'Building their first Foundation!'}

Start building: t.me/GoldenBrix_Bot

⏱️ Shining for 24 hours ✨`,

  // Template 4: Achievement Focus
  (s, c, amt, sStats, cStats) => `🎯 ACHIEVEMENT UNLOCKED! 🎯

@${s.username} Golden Brixed @${c.username} for $${amt.toFixed(2)}!

${cStats.total_received >= 10 ? '🔥 MILESTONE: 10+ Golden Brix!' : ''}
${sStats.total_sent >= 10 ? '⭐ @' + s.username + ' is a Top Architect!' : ''}

📊 The Numbers:
┌─ @${c.username}
│  └─ ${cStats.total_received || 0} Golden Brix | $${(cStats.total_amount || 0).toFixed(0)}
└─ @${s.username}
   └─ ${sStats.total_sent || 0} Golden Brix | $${(sStats.total_amount || 0).toFixed(0)}

🏗️ The Foundation grows stronger with every brick!

Build yours: t.me/GoldenBrix_Bot

⏱️ Pinned 24h | 👁️ 5,000+ views`
];

// Professional templates (for tips >= $100)
const professionalTemplates = [
  // Template 1: Business Testimonial
  (s, c, amt, sStats, cStats) => `💼 PROFESSIONAL GOLDEN BRIX 💼

@${s.username} → @${c.username}: $${amt.toFixed(2)} USDT

🎯 CLIENT TESTIMONIAL:
"Professional service, delivered on time. 
Highly recommend for similar projects."

📊 @${c.username}'s Professional Stats:
• ${cStats.total_received || 0} projects completed
• $${(cStats.total_amount || 0).toFixed(0)} total earned
• ${cStats.total_received >= 50 ? 'VERIFIED PRO ✓' : 'Rising Professional ⭐'}

🤝 @${s.username}'s Trust Signal:
• ${sStats.total_sent || 0} professionals hired
• $${(sStats.total_amount || 0).toFixed(0)} invested in talent

Hire professionals: t.me/GoldenBrix_Bot

⏱️ Featured 24h | Public testimonial`,

  // Template 2: Portfolio Showcase
  (s, c, amt, sStats, cStats) => `🏆 PORTFOLIO PIECE: GOLDEN BRIX 🏆

Project Complete: @${s.username} → @${c.username}

💰 Project Value: $${amt.toFixed(2)}
✅ Status: Successfully Delivered
📈 Result: Client Satisfied

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 @${c.username}'s Track Record:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Total Projects: ${cStats.total_received || 0}
• Revenue: $${(cStats.total_amount || 0).toFixed(0)}
• Avg Project: $${cStats.total_received > 0 ? ((cStats.total_amount || 0) / cStats.total_received).toFixed(0) : '0'}
${cStats.total_received >= 20 ? '• Status: VERIFIED PROFESSIONAL ✓' : ''}

💼 Hire @${c.username}: t.me/GoldenBrix_Bot

⏱️ 24-hour showcase | This is marketing.`,

  // Template 3: ROI Focus
  (s, c, amt, sStats, cStats) => `📈 PROFESSIONAL TRANSACTION 📈

@${s.username} invested $${amt.toFixed(2)} in @${c.username}

Why this matters:
• Public client testimonial = $100+ value
• 5,000+ professional views = $10+ ad value  
• Credibility signal = priceless
• Portfolio piece = new client leads

ROI for @${c.username}: 100-1000x on $${(amt * 0.01).toFixed(2)} boost fee

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Performance Metrics:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
@${c.username}: ${cStats.total_received || 0} projects | $${(cStats.total_amount || 0).toFixed(0)}
@${s.username}: ${sStats.total_sent || 0} hires | $${(sStats.total_amount || 0).toFixed(0)}

Smart hiring: t.me/GoldenBrix_Bot

⏱️ 24h visibility | Testimonial marketing`
];

// Create Golden Brix announcement
async function createGoldenBrixAnnouncement(request, env) {
  // Get supporter and creator details
  const supporter = await env.DB.prepare(
    'SELECT * FROM users WHERE id = ?'
  ).bind(request.supporter_id).first();
  
  const creator = await env.DB.prepare(
    'SELECT * FROM users WHERE id = ?'
  ).bind(request.creator_id).first();
  
  // Get their stats
  const supporterStats = await env.DB.prepare(`
    SELECT 
      COUNT(*) as total_sent,
      SUM(tip_amount) as total_amount
    FROM golden_brix
    WHERE supporter_id = ?
  `).bind(request.supporter_id).first();
  
  const creatorStats = await env.DB.prepare(`
    SELECT 
      COUNT(*) as total_received,
      SUM(tip_amount) as total_amount
    FROM golden_brix
    WHERE creator_id = ?
  `).bind(request.creator_id).first();
  
  // Detect user type
  const type = detectUserType(request.tip_amount);
  
  // Generate announcement with random template
  const announcement = getAnnouncementTemplate(
    supporter,
    creator,
    request.tip_amount,
    supporterStats,
    creatorStats,
    type
  );
  
  // Post to channel
  const channelResult = await sendTelegramRequest('sendMessage', {
    chat_id: env.CHANNEL_USERNAME,
    text: announcement
  }, env);
  
  const messageId = channelResult.result.message_id;
  
  // Pin message
  await sendTelegramRequest('pinChatMessage', {
    chat_id: env.CHANNEL_USERNAME,
    message_id: messageId
  }, env);
  
  // Save Golden Brix to database
  const pinnedUntil = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours
  
  await env.DB.prepare(`
    INSERT INTO golden_brix 
    (supporter_id, creator_id, tip_amount, boost_fee, tip_tx_hash, boost_tx_hash, pinned_until)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    request.supporter_id,
    request.creator_id,
    request.tip_amount,
    request.boost_fee,
    request.tip_tx_hash,
    request.boost_tx_hash,
    pinnedUntil
  ).run();
  
  // Update leaderboards
  await updateLeaderboards(request.supporter_id, request.creator_id, request.tip_amount, env);
  
  // Notify supporter
  await sendTelegramRequest('sendMessage', {
    chat_id: supporter.telegram_id,
    text: `🏆 Your Golden Brix is live!\n\nCheck it out: ${env.CHANNEL_USERNAME}\n\nIt's pinned for 24 hours. Building @${creator.username}'s career! 🧱`
  }, env);
  
  // Delete payment request
  await env.DB.prepare(
    'DELETE FROM payment_requests WHERE id = ?'
  ).bind(request.id).run();
}

// Update leaderboards
async function updateLeaderboards(supporterId, creatorId, amount, env) {
  const track = amount >= 100 ? 'professional' : 'casual';
  
  // Update supporter (architect)
  await env.DB.prepare(`
    INSERT INTO leaderboards (user_id, track, golden_brix_sent, total_sent_amount)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(user_id, track) DO UPDATE SET
      golden_brix_sent = golden_brix_sent + 1,
      total_sent_amount = total_sent_amount + ?,
      updated_at = strftime('%s', 'now')
  `).bind(supporterId, track, amount, amount).run();
  
  // Update creator (builder)
  await env.DB.prepare(`
    INSERT INTO leaderboards (user_id, track, golden_brix_received, total_received_amount)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(user_id, track) DO UPDATE SET
      golden_brix_received = golden_brix_received + 1,
      total_received_amount = total_received_amount + ?,
      updated_at = strftime('%s', 'now')
  `).bind(creatorId, track, amount, amount).run();
}

// ============================================
// MAIN WEBHOOK HANDLER
// ============================================

export default {
  // Handle incoming messages
  async fetch(request, env) {
    // Only accept POST requests
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }
    
    try {
      const update = await request.json();
      
      // Handle messages
      if (update.message) {
        const msg = update.message;
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const username = msg.from.username || 'user';
        const text = msg.text || '';
        
        // Parse command
        const parts = text.split(' ');
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);
        
        // Route commands
        if (command === '/start') {
          const startParam = args[0] || null;
          await handleStart(chatId, userId, username, env, startParam);
        }
        else if (command === '/golden') {
          await handleGolden(chatId, userId, args, env);
        }
        else if (command === '/foundation') {
          await handleFoundation(chatId, env);
        }
        else if (command === '/stats') {
          await handleStats(chatId, userId, env);
        }
        else if (command === '/button') {
          await handleButton(chatId, userId, args, env);
        }
        else if (command === '/help') {
          await handleStart(chatId, userId, username, env);
        }
        else if (command === '/admin') {
          await handleAdmin(chatId, userId, env);
        }
        else if (command === '/announce') {
          await handleAnnounce(chatId, userId, args, env);
        }
        else if (command === '/expireclean') {
          await handleExpireClean(chatId, userId, env);
        }
      }
      
      return new Response('OK', { status: 200 });
      
    } catch (error) {
      console.error('Error:', error);
      return new Response('Error', { status: 500 });
    }
  },
  
  // Handle scheduled payment detection (runs every minute)
  async scheduled(event, env, ctx) {
    try {
      console.log('Running payment detection...');
      
      // Get all pending payment requests
      const pending = await env.DB.prepare(`
        SELECT * FROM payment_requests 
        WHERE expires_at > ?
        AND (tip_paid = 0 OR boost_paid = 0)
      `).bind(Math.floor(Date.now() / 1000)).all();
      
      if (pending.results.length === 0) {
        console.log('No pending requests');
        return;
      }
      
      console.log(`Found ${pending.results.length} pending requests`);
      
      // Check boost wallet for new transactions
      const transactions = await checkTONTransactions(env.GOLDENBRIX_BOOST_ADDRESS, env);
      const usdtTxs = parseUSDTTransactions(transactions);
      
      console.log(`Found ${usdtTxs.length} USDT transactions`);
      
      // Match each transaction to pending requests
      for (const tx of usdtTxs) {
        const matched = await matchPayment(tx, env);
        
        if (matched && matched.tip_paid && matched.boost_paid) {
          console.log(`Both payments complete for code: ${matched.code}`);
          // Both payments complete - create Golden Brix!
          await createGoldenBrixAnnouncement(matched, env);
        }
      }
      
    } catch (error) {
      console.error('Payment checker error:', error);
    }
  }
};

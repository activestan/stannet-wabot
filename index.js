const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const dotenv = require('dotenv');
const db = require('./src/database/db');
const { createDedicatedAccount } = require('./src/services/paystack');
const { getUnusedVoucher } = require('./src/services/omada');

dotenv.config();

const OWNER_NUMBER = process.env.OWNER_NUMBER + "@c.us";
const userState = new Map();

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true, args: ['--no-sandbox'] }
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));

client.on('ready', () => {
    console.log('✅ Stannet WhatsApp Bot is ready!');
});

// ==================== MESSAGE HANDLER ====================

client.on('message', async (message) => {
    const from = message.from;
    const text = message.body.trim();
    const lowerText = text.toLowerCase();

    // Get or create user with dedicated account
    let user = db.prepare('SELECT * FROM users WHERE whatsapp_number = ?').get(from);

    if (!user) {
        console.log(`Creating dedicated Paystack account for ${from}...`);
        const account = await createDedicatedAccount(from.replace('@c.us', ''));

        if (account) {
            db.prepare(`
                INSERT INTO users (whatsapp_number, paystack_customer_id, paystack_account_number, paystack_account_name)
                VALUES (?, ?, ?, ?)
            `).run(from, account.customerId, account.accountNumber, account.accountName);

            user = db.prepare('SELECT * FROM users WHERE whatsapp_number = ?').get(from);
        }
    }

    // Show plans + dedicated account
    if (['hi', 'hello', 'start', 'packages'].includes(lowerText)) {
        const reply = `Welcome to *Stannet WiFi Bot* 🔥\n\n` +
            `Choose a plan:\n\n` +
            `1️⃣  ₦400  = 1 Day\n` +
            `2️⃣  ₦1000 = 3 Days\n` +
            `3️⃣  ₦2000 = 7 Days\n` +
            `4️⃣  ₦7000 = 31 Days\n\n` +
            `🏦 *Your Personal Paystack Account*\n` +
            `Account Number: *${user.paystack_account_number}*\n` +
            `Account Name: *${user.paystack_account_name}*\n\n` +
            `Pay into the account above. Your voucher will be sent automatically.`;

        await message.reply(reply);
    }
});

// ==================== PAYSTACK WEBHOOK (Automatic Detection) ====================

const express = require('express');
const app = express();
app.use(express.json());

app.post('/paystack/webhook', async (req, res) => {
    const event = req.body;

    if (event.event === 'charge.success') {
        const payment = event.data;
        const amount = payment.amount / 100;
        const reference = payment.reference;
        const paidAccount = payment.authorization?.receiver_bank_account_number;

        console.log(`Payment received: ₦${amount} to account ${paidAccount}`);

        // Find user by the account number that received the money
        const user = db.prepare('SELECT * FROM users WHERE paystack_account_number = ?').get(paidAccount);

        if (user) {
            // Check if payment already processed
            const existing = db.prepare('SELECT * FROM payments WHERE reference = ?').get(reference);
            if (existing) {
                return res.sendStatus(200);
            }

            // Record the payment
            db.prepare(`
                INSERT INTO payments (whatsapp_number, reference, amount, status)
                VALUES (?, ?, ?, 'success')
            `).run(user.whatsapp_number, reference, amount);

            // Get voucher based on amount paid
            const voucher = await getUnusedVoucher(amount);

            if (voucher) {
                // Send voucher to user
                await client.sendMessage(user.whatsapp_number, 
                    `✅ *Payment Confirmed!*\n\n` +
                    `Amount: ₦${amount}\n` +
                    `Your WiFi Code: *${voucher.code}*\n` +
                    `Duration: ${voucher.duration}\n\n` +
                    `Thank you for using Stannet!`
                );

                console.log(`✅ Voucher sent to ${user.whatsapp_number}`);
            } else {
                await client.sendMessage(user.whatsapp_number, 
                    `Payment received but no voucher available for ₦${amount}. Please contact support.`
                );
            }
        } else {
            console.log(`No user found for account: ${paidAccount}`);
        }
    }

    res.sendStatus(200);
});

app.listen(3000, () => {
    console.log('✅ Webhook server running on port 3000');
});

client.initialize();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const dotenv = require('dotenv');
const express = require('express');
const { 
    getUser, 
    createUser, 
    getUserByAccount, 
    savePayment, 
    paymentExists, 
    getAvailableVoucher, 
    markVoucherUsed 
} = require('./src/database/db');
const { createDedicatedAccount } = require('./src/services/paystack');

dotenv.config();

const OWNER_NUMBER = process.env.OWNER_NUMBER + "@c.us";
const app = express();
app.use(express.json());

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
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

    let user = getUser(from);

    if (!user) {
        console.log(`Creating dedicated account for ${from}...`);
        const account = await createDedicatedAccount(from.replace('@c.us', ''));

        if (account) {
            user = createUser({
                whatsapp_number: from,
                paystack_customer_id: account.customerId,
                paystack_account_number: account.accountNumber,
                paystack_account_name: account.accountName
            });
        }
    }

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
            `Pay into the account above. Voucher will be sent automatically.`;

        await message.reply(reply);
    }
});

// ==================== PAYSTACK WEBHOOK ====================

app.post('/paystack/webhook', async (req, res) => {
    const event = req.body;

    if (event.event === 'charge.success') {
        const payment = event.data;
        const amount = payment.amount / 100;
        const reference = payment.reference;
        const paidAccount = payment.authorization?.receiver_bank_account_number;

        console.log(`Payment received: ₦${amount} → ${paidAccount}`);

        if (paymentExists(reference)) {
            return res.sendStatus(200);
        }

        const user = getUserByAccount(paidAccount);

        if (user) {
            savePayment({
                whatsapp_number: user.whatsapp_number,
                reference: reference,
                amount: amount,
                status: 'success'
            });

            const voucher = getAvailableVoucher(amount);

            if (voucher) {
                markVoucherUsed(voucher.code, user.whatsapp_number);

                await client.sendMessage(user.whatsapp_number, 
                    `✅ *Payment Confirmed!*\n\n` +
                    `Amount: ₦${amount}\n` +
                    `Your WiFi Code: *${voucher.code}*\n` +
                    `Duration: ${voucher.duration}\n\n` +
                    `Thank you for using Stannet!`
                );
            } else {
                await client.sendMessage(user.whatsapp_number, 
                    `Payment received but no voucher available for ₦${amount}.`
                );
            }
        }
    }

    res.sendStatus(200);
});

app.listen(3000, () => console.log('✅ Webhook server running on port 3000'));

client.initialize();
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '../../data.json');

// Initialize database
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({
        users: [],
        vouchers: [],
        payments: []
    }, null, 2));
}

function readDB() {
    return JSON.parse(fs.readFileSync(DB_FILE));
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Users
function getUser(whatsappNumber) {
    const db = readDB();
    return db.users.find(u => u.whatsapp_number === whatsappNumber);
}

function createUser(userData) {
    const db = readDB();
    db.users.push(userData);
    writeDB(db);
    return userData;
}

function getUserByAccount(accountNumber) {
    const db = readDB();
    return db.users.find(u => u.paystack_account_number === accountNumber);
}

// Payments
function savePayment(payment) {
    const db = readDB();
    db.payments.push(payment);
    writeDB(db);
}

function paymentExists(reference) {
    const db = readDB();
    return db.payments.some(p => p.reference === reference);
}

// Vouchers
function getAvailableVoucher(amount) {
    const db = readDB();
    return db.vouchers.find(v => v.amount === amount && v.status === 'available');
}

function markVoucherUsed(code, whatsappNumber) {
    const db = readDB();
    const voucher = db.vouchers.find(v => v.code === code);
    if (voucher) {
        voucher.status = 'used';
        voucher.used_by = whatsappNumber;
        voucher.used_at = new Date().toISOString();
        writeDB(db);
    }
}

module.exports = {
    getUser,
    createUser,
    getUserByAccount,
    savePayment,
    paymentExists,
    getAvailableVoucher,
    markVoucherUsed
};
const axios = require('axios');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

const paystack = axios.create({
    baseURL: 'https://api.paystack.co',
    headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json'
    }
});

// Create customer + dedicated virtual account
async function createDedicatedAccount(whatsappNumber) {
    try {
        // Create customer
        const customerRes = await paystack.post('/customer', {
            email: `${whatsappNumber}@stannet.com`,
            first_name: 'Stannet',
            last_name: 'User',
            phone: whatsappNumber
        });

        const customerId = customerRes.data.data.id;

        // Create dedicated virtual account
        const accountRes = await paystack.post('/dedicated_account', {
            customer: customerId,
            preferred_bank: 'wema-bank'
        });

        const accountData = accountRes.data.data;

        return {
            customerId: customerId,
            accountNumber: accountData.account_number,
            accountName: accountData.account_name,
            bank: accountData.bank.name
        };
    } catch (error) {
        console.error('Paystack Error:', error.response?.data || error.message);
        return null;
    }
}

// Verify payment
async function verifyPayment(reference) {
    try {
        const res = await paystack.get(`/transaction/verify/${reference}`);
        if (res.data.data.status === 'success') {
            return {
                success: true,
                amount: res.data.data.amount / 100,
                reference: reference
            };
        }
        return { success: false };
    } catch (error) {
        return { success: false };
    }
}

module.exports = {
    createDedicatedAccount,
    verifyPayment
};
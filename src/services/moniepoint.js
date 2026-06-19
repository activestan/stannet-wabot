const pendingPayments = new Map();

function recordPendingPayment(reference, from, amount) {
    pendingPayments.set(reference, {
        from,
        amount,
        status: 'pending'
    });
}

function approvePayment(reference) {
    if (pendingPayments.has(reference)) {
        const payment = pendingPayments.get(reference);
        payment.status = 'approved';
        return payment;
    }
    return null;
}

module.exports = {
    recordPendingPayment,
    approvePayment
};
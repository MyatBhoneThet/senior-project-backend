const DebtRecord = require('../models/DebtRecord');

async function findDebtForUser(debtId, userId) {
  const debt = await DebtRecord.findOne({
    _id: debtId,
    $or: [{ lenderId: userId }, { borrowerId: userId }],
  });

  return debt;
}

function getOtherParticipant(debt, userId) {
  const id = String(userId);
  if (String(debt.lenderId) === id) return debt.borrowerId;
  if (String(debt.borrowerId) === id) return debt.lenderId;
  return null;
}

function isDebtParticipant(debt, userId) {
  const id = String(userId);
  return String(debt.lenderId) === id || String(debt.borrowerId) === id;
}

module.exports = {
  findDebtForUser,
  getOtherParticipant,
  isDebtParticipant,
};

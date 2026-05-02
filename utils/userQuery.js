const mongoose = require('mongoose');

function getUserOwnershipConditions(userId) {
  if (!userId) return [];

  const uid = String(userId);
  const conditions = [
    { userId: uid },
    { user: uid },
    { userID: uid },
    { owner: uid },
    { createdBy: uid },
    { uid: uid },
  ];

  if (mongoose.Types.ObjectId.isValid(uid)) {
    conditions.unshift({ userId: new mongoose.Types.ObjectId(uid) });
  }

  return conditions;
}

function buildUserQuery(userId) {
  const conditions = getUserOwnershipConditions(userId);
  if (!conditions.length) return {};
  return { $or: conditions };
}

module.exports = {
  buildUserQuery,
  getUserOwnershipConditions,
};

const Goal = require("../models/Goal");
const RecurringRule = require("../models/RecurringRule");
const { buildUserQuery } = require("../utils/userQuery");
const {
  loadIncomeHistory,
  loadExpenseHistory,
  groupExpensesByCategory,
} = require("../utils/historyQueries");

exports.getDashboardData = async (req, res) => {
  try {
    const userId = req.user.id;
    const { period = 'M' } = req.query;

    const now = new Date();
    const startOfDay = (date) => {
      const next = new Date(date);
      next.setHours(0, 0, 0, 0);
      return next;
    };
    const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
    const startOfWeek = (date) => {
      const next = startOfDay(date);
      const day = next.getDay();
      next.setDate(next.getDate() - day);
      return next;
    };
    const startOfQuarter = (date) => new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
    const startOfYear = (date) => new Date(date.getFullYear(), 0, 1);
    const endOfMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

    let startDate = startOfMonth(now);
    let prevStartDate = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    let prevEndDate = endOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));

    if (period === 'W') {
      startDate = startOfWeek(now);
      prevStartDate = new Date(startDate);
      prevStartDate.setDate(prevStartDate.getDate() - 7);
      prevEndDate = new Date(startDate);
      prevEndDate.setMilliseconds(prevEndDate.getMilliseconds() - 1);
    } else if (period === 'Q') {
      startDate = startOfQuarter(now);
      prevStartDate = new Date(startDate);
      prevStartDate.setMonth(prevStartDate.getMonth() - 3);
      prevEndDate = new Date(startDate);
      prevEndDate.setMilliseconds(prevEndDate.getMilliseconds() - 1);
    } else if (period === 'Y') {
      startDate = startOfYear(now);
      prevStartDate = new Date(startDate);
      prevStartDate.setFullYear(prevStartDate.getFullYear() - 1);
      prevEndDate = new Date(startDate);
      prevEndDate.setMilliseconds(prevEndDate.getMilliseconds() - 1);
    } else {
      startDate = startOfMonth(now);
      prevStartDate = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      prevEndDate = endOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    }

    const since60Days = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const [
      incomeHistory,
      expenseHistory,
      goals,
      recurringRules,
    ] = await Promise.all([
      loadIncomeHistory(userId),
      loadExpenseHistory(userId),
      Goal.find(buildUserQuery(userId)).sort({ createdAt: -1 }).lean(),
      RecurringRule.find(buildUserQuery(userId)).sort({ createdAt: -1 }).lean(),
    ]);

    const within = (row, since, until) => {
      const d = new Date(row.date || row.createdAt);
      if (Number.isNaN(d.getTime())) return false;
      if (since && d < since) return false;
      if (until && d > until) return false;
      return true;
    };

    const periodIncomeTransactions = incomeHistory.filter((row) => within(row, startDate));
    const periodExpenseTransactions = expenseHistory.filter((row) => within(row, startDate));
    const prevPeriodIncomeTransactions = incomeHistory.filter((row) => within(row, prevStartDate, prevEndDate));
    const prevPeriodExpenseTransactions = expenseHistory.filter((row) => within(row, prevStartDate, prevEndDate));
    const last60DaysIncomeTransactions = incomeHistory.filter((row) => within(row, since60Days));
    const last60DaysExpenseTransactions = expenseHistory.filter((row) => within(row, since60Days));
    const recentIncomeTransactions = [...incomeHistory].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)).slice(0, 5);
    const recentExpenseTransactions = [...expenseHistory].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)).slice(0, 5);

    const totalAllTimeIncome = incomeHistory.reduce((sum, t) => sum + (t.amount || 0), 0);
    const totalAllTimeExpense = expenseHistory.reduce((sum, t) => sum + (t.amount || 0), 0);
    const periodIncomeTotal = periodIncomeTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
    const periodExpenseTotal = periodExpenseTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
    const prevPeriodIncomeTotal = prevPeriodIncomeTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
    const prevPeriodExpenseTotal = prevPeriodExpenseTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
    const expenseByCategory = groupExpensesByCategory(periodExpenseTransactions);

    // fetch latest transactions (income + expenses)
    const lastTransactions = [...recentIncomeTransactions, ...recentExpenseTransactions]
        .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));

    const goalItems = goals.map((goal) => {
        const targetAmount = Number(goal.targetAmount || 0);
        const currentAmount = Number(goal.currentAmount || 0);
        const progress = targetAmount > 0 ? Math.min(100, Math.max(0, (currentAmount / targetAmount) * 100)) : 0;
        return {
            _id: goal._id,
            title: goal.title,
            targetAmount,
            currentAmount,
            status: goal.status,
            targetDate: goal.targetDate,
            progress,
        };
    });
    const activeGoalsCount = goalItems.filter((goal) => goal.status === "active").length;
    const goalsTotalTargetAmount = goalItems.reduce((sum, goal) => sum + goal.targetAmount, 0);
    const goalsTotalCurrentAmount = goalItems.reduce((sum, goal) => sum + goal.currentAmount, 0);

    const recurringItems = recurringRules.map((rule) => ({
        _id: rule._id,
        type: rule.type,
        category: rule.category,
        source: rule.source || "",
        amount: Number(rule.amount || 0),
        repeat: rule.repeat,
        isActive: !!rule.isActive,
    }));
    const activeRecurringCount = recurringItems.filter((rule) => rule.isActive).length;
    const recurringMonthlyTotal = recurringItems
        .filter((rule) => rule.isActive)
        .reduce((sum, rule) => {
            const amount = Number(rule.amount || 0);
            if (rule.repeat === "weekly") return sum + amount * 4.345;
            if (rule.repeat === "yearly") return sum + amount / 12;
            return sum + amount;
        }, 0);

    res.json({
      totalBalance: totalAllTimeIncome - totalAllTimeExpense,
      totalIncome: periodIncomeTotal,
      totalExpenses: periodExpenseTotal,
      prevPeriodIncome: prevPeriodIncomeTotal,
      prevPeriodExpenses: prevPeriodExpenseTotal,
      last60DaysIncome: {
        total: last60DaysIncomeTransactions.reduce((sum, t) => sum + (t.amount || 0), 0),
        transactions: last60DaysIncomeTransactions,
      },
      last60DaysExpense: {
        total: last60DaysExpenseTransactions.reduce((sum, t) => sum + (t.amount || 0), 0),
        transactions: last60DaysExpenseTransactions,
      },
      periodData: {
        income: {
          total: periodIncomeTotal,
          transactions: periodIncomeTransactions,
        },
        expense: {
          total: periodExpenseTotal,
          transactions: periodExpenseTransactions,
        },
      },
      recentTransactions: lastTransactions,
      goals: {
        total: goalItems.length,
        active: activeGoalsCount,
        totalTargetAmount: goalsTotalTargetAmount,
        totalCurrentAmount: goalsTotalCurrentAmount,
        items: goalItems,
      },
      recurring: {
        total: recurringItems.length,
        active: activeRecurringCount,
        monthlyTotal: recurringMonthlyTotal,
        items: recurringItems,
      },
      spendingByCategory: expenseByCategory,
    });
    } catch (error){
        res.status(500).json({ message: "Server Error", error});
    }
}

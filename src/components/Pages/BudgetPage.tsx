import React, { useState } from 'react';
import { PlusCircle, DollarSign, TrendingUp, PieChart, Download, Share } from 'lucide-react';
import { Expense, ExpenseCategory } from '../../types';
import { SAMPLE_EXPENSES } from '../../utils/mockData';
import { apiService } from '../../services/api';

const BudgetPage: React.FC = () => {
  const [expenses, setExpenses] = useState<Expense[]>(SAMPLE_EXPENSES);
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [newExpense, setNewExpense] = useState({
    category: '',
    amount: '',
    description: ''
  });

  const categories: ExpenseCategory[] = [
    { category: 'Transport', budgeted: 15000, spent: 8500, color: '#3B82F6' },
    { category: 'Accommodation', budgeted: 20000, spent: 12000, color: '#10B981' },
    { category: 'Food', budgeted: 8000, spent: 5800, color: '#F59E0B' },
    { category: 'Activities', budgeted: 7000, spent: 3200, color: '#EF4444' },
    { category: 'Shopping', budgeted: 5000, spent: 2100, color: '#8B5CF6' },
    { category: 'Miscellaneous', budgeted: 3000, spent: 800, color: '#06B6D4' }
  ];

  const totalBudget = categories.reduce((sum, cat) => sum + cat.budgeted, 0);
  const totalSpent = categories.reduce((sum, cat) => sum + cat.spent, 0);
  const remaining = totalBudget - totalSpent;

  const addExpense = () => {
    if (!newExpense.category || !newExpense.amount || !newExpense.description) {
      alert('Please fill all fields');
      return;
    }

    const expense: Expense = {
      id: Date.now().toString(),
      category: newExpense.category,
      amount: parseInt(newExpense.amount),
      description: newExpense.description,
      paidBy: 'user1',
      date: new Date(),
      splitBetween: ['user1']
    };

    setExpenses(prev => [expense, ...prev]);
    setNewExpense({ category: '', amount: '', description: '' });
  };

  const getAIBudgetAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const response = await apiService.analyzeBudget({
        expenses,
        totalBudget,
        destination: 'Current Trip', // You can make this dynamic
        duration: 7 // You can calculate this from trip dates
      });
      setAiAnalysis(response.analysis);
    } catch (error) {
      console.error('Failed to get budget analysis:', error);
      setAiAnalysis('Unable to analyze budget at the moment. Please try again later.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen p-6">
      <div className="content-container">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-primary mb-4">
            Budget Planner
          </h1>
          <p className="text-xl text-secondary">
            Track expenses and optimize your travel budget smartly
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Budget Overview */}
          <div className="lg:col-span-2 space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="glass-card p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-secondary">Total Budget</p>
                    <p className="text-3xl font-bold text-primary">
                      ₹{totalBudget.toLocaleString('en-IN')}
                    </p>
                  </div>
                  <DollarSign className="h-12 w-12 text-primary" />
                </div>
              </div>

              <div className="glass-card p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-secondary">Total Spent</p>
                    <p className="text-3xl font-bold text-red-400">
                      ₹{totalSpent.toLocaleString('en-IN')}
                    </p>
                  </div>
                  <TrendingUp className="h-12 w-12 text-red-400" />
                </div>
                <div className="mt-2">
                  <div className="w-full bg-white/10 rounded-full h-2">
                    <div 
                      className="bg-red-400 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(totalSpent / totalBudget) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              <div className="glass-card p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-secondary">Remaining</p>
                    <p className={`text-3xl font-bold ${remaining >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ₹{Math.abs(remaining).toLocaleString('en-IN')}
                    </p>
                  </div>
                  <PieChart className={`h-12 w-12 ${remaining >= 0 ? 'text-green-400' : 'text-red-400'}`} />
                </div>
              </div>
            </div>

            {/* Category Breakdown */}
            <div className="glass-card p-6">
              <h2 className="text-2xl font-bold text-primary mb-6">Category Breakdown</h2>
              <div className="space-y-4">
                {categories.map((category, index) => {
                  const percentage = (category.spent / category.budgeted) * 100;
                  return (
                    <div key={index} className="p-4 glass-card hover:bg-white/10 transition-all duration-300">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center">
                          <div 
                            className="w-4 h-4 rounded-full mr-3"
                            style={{ backgroundColor: category.color }}
                          ></div>
                          <span className="font-semibold text-primary">{category.category}</span>
                        </div>
                        <span className="text-sm text-secondary">
                          ₹{category.spent.toLocaleString('en-IN')} / ₹{category.budgeted.toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="w-full bg-white/10 rounded-full h-3">
                        <div 
                          className="h-3 rounded-full transition-all duration-500"
                          style={{ 
                            width: `${Math.min(percentage, 100)}%`,
                            backgroundColor: category.color
                          }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-sm text-secondary mt-1">
                        <span>{percentage.toFixed(1)}% used</span>
                        <span>₹{(category.budgeted - category.spent).toLocaleString('en-IN')} left</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent Expenses */}
            <div className="glass-card p-6">
              <h2 className="text-2xl font-bold text-primary mb-6">Recent Expenses</h2>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {expenses.map((expense) => (
                  <div key={expense.id} className="flex items-center justify-between p-4 glass-card hover:bg-white/10 transition-all duration-300">
                    <div className="flex-grow">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-primary">{expense.description}</h3>
                        <span className="text-lg font-bold text-red-400">
                          -₹{expense.amount.toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="flex items-center text-sm text-secondary mt-1">
                        <span className="bg-white/10 px-2 py-1 rounded-full mr-2">{expense.category}</span>
                        <span>{expense.date.toLocaleDateString('en-IN')}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Add Expense Form */}
          <div className="space-y-6">
            <div className="glass-card p-6">
              <h2 className="text-2xl font-bold text-primary mb-6 flex items-center">
                <PlusCircle className="h-6 w-6 mr-2 text-green-400" />
                Add Expense
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-secondary mb-2">Category</label>
                  <select
                    value={newExpense.category}
                    onChange={(e) => setNewExpense(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-4 py-3 glass-input rounded-xl"
                  >
                    <option value="">Select category</option>
                    {categories.map(cat => (
                      <option key={cat.category} value={cat.category}>{cat.category}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary mb-2">Amount (₹)</label>
                  <input
                    type="number"
                    value={newExpense.amount}
                    onChange={(e) => setNewExpense(prev => ({ ...prev, amount: e.target.value }))}
                    placeholder="Enter amount"
                    className="w-full px-4 py-3 glass-input rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary mb-2">Description</label>
                  <input
                    type="text"
                    value={newExpense.description}
                    onChange={(e) => setNewExpense(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="What did you spend on?"
                    className="w-full px-4 py-3 glass-input rounded-xl"
                  />
                </div>

                <button
                  onClick={addExpense}
                  className="w-full premium-button-primary py-3 px-6 rounded-xl font-semibold"
                >
                  Add Expense
                </button>
              </div>
            </div>

            {/* Visual Chart Placeholder */}
            <div className="glass-card p-6">
              <h3 className="text-lg font-bold text-primary mb-4">Spending Distribution</h3>
              <div className="relative h-48 glass-card flex items-center justify-center">
                <div className="text-center">
                  <PieChart className="h-16 w-16 text-primary mx-auto mb-2" />
                  <p className="text-sm text-secondary">Interactive chart would appear here</p>
                </div>
              </div>
            </div>

            {/* Export Options */}
            <div className="glass-card p-6">
              <h3 className="text-lg font-bold text-primary mb-4">Export & Share</h3>
              <div className="space-y-3">
                <button className="w-full flex items-center justify-center py-3 px-4 premium-button-secondary rounded-xl">
                  <Download className="h-5 w-5 mr-2 text-secondary" />
                  Export PDF Report
                </button>
                <button className="w-full flex items-center justify-center py-3 px-4 premium-button-secondary rounded-xl">
                  <Share className="h-5 w-5 mr-2 text-secondary" />
                  Share with Group
                </button>
              </div>
            </div>

            {/* AI Suggestions */}
            <div className="glass-card p-6 border border-orange-500/30">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-primary">🤖 AI Budget Analysis</h3>
                <button
                  onClick={getAIBudgetAnalysis}
                  disabled={isAnalyzing}
                  className="premium-button-primary px-3 py-1 rounded-lg text-sm font-semibold disabled:opacity-50"
                >
                  {isAnalyzing ? 'Analyzing...' : 'Get AI Tips'}
                </button>
              </div>
              {aiAnalysis ? (
                <div className="text-sm text-secondary whitespace-pre-wrap">
                  {aiAnalysis}
                </div>
              ) : (
                <div className="space-y-2 text-sm text-secondary">
                  <p>• Click "Get AI Tips" for personalized budget analysis</p>
                  <p>• AI will analyze your spending patterns</p>
                  <p>• Get recommendations for cost optimization</p>
                </div>
              )}
            </div>
          </div>
          </div>
        </div>
      </div>
  );
};

export default BudgetPage;
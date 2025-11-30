# Member Contribution & Personal Expense Log - Implementation Guide

## Overview
This feature adds a new "Member Contribution & Personal Expense Log" section to the Budget Planner page. It allows group leaders to track individual member contributions and maintain personal expense wallets for each member.

## Database Schema

### Updated Table: `group_members`
A new column `wallet_balance` has been added to track the remaining balance in each member's individual contribution wallet.

```sql
ALTER TABLE group_members 
ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(14,2) DEFAULT 0;
```

**Schema File:** `member-contribution-schema.sql`

### Key Fields:
- `budget_share`: The amount each member contributes to the total trip budget (set by leader)
- `wallet_balance`: Remaining balance in member's individual wallet (calculated as `budget_share - personal_expenses`)
- `total_paid`: Total amount paid by member for all expenses
- `total_owed`: Total amount owed by member (from shared expenses)
- `balance`: Settlement balance (`total_paid - total_owed`)

## How It Works

### 1. Member Contributions
- Group leaders can set how much each member contributes via the "Assign Budget Shares" modal
- When a contribution is set, the member's `wallet_balance` is initialized to match `budget_share`
- The total of all contributions is displayed in the summary

### 2. Personal Expenses
A **personal expense** is defined as an expense where:
- The `paid_by_id` matches a member
- The `split_between` array contains only that member's ID (length = 1)

When a personal expense is recorded:
- It automatically deducts from that member's `wallet_balance`
- It also deducts from the overall trip budget
- The expense appears in the member's personal expense log

### 3. Shared Expenses
Expenses split between multiple members:
- Do NOT affect individual wallet balances
- Are tracked in the overall budget
- Are used for settlement calculations (`total_paid` and `total_owed`)

### 4. Wallet Balance Calculation
The wallet balance is calculated as:
```
wallet_balance = budget_share - personal_expenses
```

Where `personal_expenses` = sum of all expenses where:
- `paid_by_id` = member's ID
- `split_between` = [member's ID] (only one person)

## UI Features

### New Section: "Member Contribution & Personal Expense Log"
Located after "Member Budget Share & Balances" section.

**Summary Cards:**
- Total Contributions: Sum of all member contributions
- Total Wallet Balance: Sum of all remaining wallet balances
- Personal Expenses: Total personal expenses deducted

**Individual Member Wallets:**
Each member card displays:
- Contribution amount
- Current wallet balance
- Personal expenses total
- Remaining percentage
- Visual progress bar (color-coded: green >50%, yellow 20-50%, red <20%)
- List of personal expenses with details

**Leader Actions:**
- "Manage Contributions" button to set/update member contributions
- Only visible to group leaders

## Implementation Details

### Files Modified:

1. **`member-contribution-schema.sql`**
   - Database migration to add `wallet_balance` column

2. **`src/services/budgetRepository.ts`**
   - Updated `GroupMemberSummary` interface to include `walletBalance`
   - Modified `recalculateGroupMemberBalances()` to calculate wallet balances
   - Updated `updateMemberBudgetShare()` and `updateMemberBudgetShares()` to maintain wallet balances
   - Updated `mapMemberSummary()` to include wallet balance mapping

3. **`src/components/Pages/BudgetPage.tsx`**
   - Added new "Member Contribution & Personal Expense Log" section
   - Displays member wallets with contribution, balance, and personal expenses
   - Shows summary statistics
   - Lists personal expenses per member

## Usage Flow

1. **Setting Contributions (Leader):**
   - Click "Manage Contributions" or "Assign Budget Shares"
   - Enter contribution amount for each member
   - Save - wallet balances are initialized to match contributions

2. **Adding Personal Expenses:**
   - Use the "Add Expense" form
   - Select a member as "Paid By"
   - Select only that same member in "Split Between"
   - The expense automatically deducts from their wallet

3. **Viewing Wallets:**
   - Navigate to Budget Planner page
   - Scroll to "Member Contribution & Personal Expense Log" section
   - View individual wallet balances and personal expenses

## Database Migration

To apply the schema changes, run the SQL file in Supabase SQL Editor:

```sql
-- Run: member-contribution-schema.sql
```

This will:
- Add `wallet_balance` column to `group_members` table
- Initialize existing records with `wallet_balance = budget_share`
- Create index for performance
- Add documentation comment

## Notes

- Wallet balances are automatically recalculated when expenses are added/removed
- When budget shares are updated, wallet balances are adjusted to maintain personal expense history
- Personal expenses are clearly distinguished from shared expenses in the UI
- The feature works seamlessly with existing budget tracking functionality


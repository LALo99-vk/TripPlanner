import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'WanderWise API is running' });
});

// AI Chat Assistant endpoint
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, context } = req.body;

    const systemPrompt = `You are WanderWise AI, an expert Indian travel assistant. You help users plan trips across India, provide budget advice, booking recommendations, and travel insights. 

Key guidelines:
- Focus on Indian destinations, culture, and travel patterns
- Provide practical advice with specific costs in Indian Rupees (₹)
- Suggest authentic local experiences
- Consider Indian weather patterns and seasons
- Be helpful, friendly, and culturally aware
- Keep responses concise but informative

Context: ${context || 'General travel assistance'}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const aiResponse = completion.choices[0]?.message?.content || "I'm sorry, I couldn't process that request.";

    res.json({
      success: true,
      response: aiResponse,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('OpenAI API Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get AI response',
      message: 'Please try again later'
    });
  }
});

// AI Trip Planning endpoint (returns structured JSON)
app.post('/api/ai/plan-trip', async (req, res) => {
  try {
    const { from, to, startDate, endDate, budget, travelers, interests } = req.body;

    const prompt = `You are WanderWise, generate a fully structured trip plan strictly as valid JSON only, with no markdown.

Input:
from: ${from}
to: ${to}
startDate: ${startDate}
endDate: ${endDate}
budgetINR: ${budget}
travelers: ${travelers}
interests: ${Array.isArray(interests) ? interests.join(', ') : interests}

Rules:
- Output MUST be strictly JSON parseable. Do not include code fences or commentary.
- Use Indian Rupees (INR) with numeric costs (no symbols), client will format.
- Provide hidden gems and famous places aligned to interests.
- Ensure total estimated cost is within budget; if over, note a budgetWarning string.

JSON schema (example keys; follow names exactly):
{
  "overview": {
    "from": string,
    "to": string,
    "durationDays": number,
    "budgetINR": number,
    "travelers": number,
    "interests": string[],
    "summary": string
  },
  "days": [
    {
      "day": number,
      "header": string,
      "slots": {
        "morning": [
          {"name": string, "description": string, "location": string, "duration": string, "costINR": number, "travelDistanceKm": number}
        ],
        "afternoon": [...],
        "evening": [...]
      },
      "aiTip": string,
      "totalDayCostINR": number
    }
  ],
  "totals": {
    "totalCostINR": number,
    "breakdown": {"stay": number, "food": number, "transport": number, "activities": number, "misc": number}
  },
  "budgetWarning": string | null
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are an expert Indian travel planner. Always return STRICT JSON per user schema, with realistic INR costs and distances." },
        { role: "user", content: prompt }
      ],
      max_tokens: 1500,
      temperature: 0.7,
    });

    const aiResponse = completion.choices[0]?.message?.content || "{}";
    let parsed;
    try {
      parsed = JSON.parse(aiResponse);
    } catch (e) {
      // Try to salvage by trimming code fences if any
      const trimmed = aiResponse.replace(/^```[a-zA-Z]*\n?|```$/g, '').trim();
      try { parsed = JSON.parse(trimmed); } catch (e2) { parsed = null; }
    }

    if (!parsed) {
      return res.status(502).json({ success: false, error: 'Invalid AI response', message: 'AI did not return valid JSON' });
    }

    res.json({
      success: true,
      data: parsed,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Trip Planning Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate trip plan',
      message: 'Please try again later'
    });
  }
});

// AI Budget Analysis endpoint
app.post('/api/ai/budget-analysis', async (req, res) => {
  try {
    const { expenses, totalBudget, destination, duration } = req.body;

    const prompt = `Analyze this travel budget for a ${duration}-day trip to ${destination}:

Total Budget: ₹${totalBudget}
Current Expenses: ${JSON.stringify(expenses)}

Please provide:
1. Budget analysis and spending patterns
2. Recommendations for cost optimization
3. Suggestions for remaining budget allocation
4. Warnings if overspending in any category
5. Tips for saving money in ${destination}

Keep the response practical and specific to Indian travel costs.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are a financial advisor specializing in Indian travel budgets. Provide practical money-saving tips and budget analysis." },
        { role: "user", content: prompt }
      ],
      max_tokens: 800,
      temperature: 0.7,
    });

    const aiResponse = completion.choices[0]?.message?.content || "Unable to analyze budget";

    res.json({
      success: true,
      analysis: aiResponse,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Budget Analysis Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze budget',
      message: 'Please try again later'
    });
  }
});

// AI Budget Optimization endpoint
app.post('/api/ai/optimize-budget', async (req, res) => {
  try {
    const { plan, targetAdjustmentINR, preference } = req.body; // preference: 'reduce_cost' | 'upgrade'

    const prompt = `You will optimize the following trip plan JSON by ${preference === 'reduce_cost' ? 'reducing' : 'upgrading'} total cost by approximately ${targetAdjustmentINR} INR while keeping overall structure. Return STRICT JSON with fields: { updatedPlan, changes: [{type, before, after, rationale}], newTotals }.

Plan JSON:
${JSON.stringify(plan)}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a budget optimization assistant. Always return strict JSON only.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1200,
      temperature: 0.4,
    });

    const aiResponse = completion.choices[0]?.message?.content || '{}';
    let parsed;
    try { parsed = JSON.parse(aiResponse); } catch {
      const trimmed = aiResponse.replace(/^```[a-zA-Z]*\n?|```$/g, '').trim();
      try { parsed = JSON.parse(trimmed); } catch { parsed = null; }
    }
    if (!parsed) return res.status(502).json({ success: false, error: 'Invalid AI response' });
    res.json({ success: true, data: parsed, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Budget Optimization Error:', error);
    res.status(500).json({ success: false, error: 'Failed to optimize budget', message: 'Please try again later' });
  }
});

// AI Smart Adjust endpoint
app.post('/api/ai/smart-adjust', async (req, res) => {
  try {
    const { plan, action } = req.body; // action: { type: 'reduce_cost' | 'add_activities', amountINR?: number, theme?: string }

    const prompt = `Apply this smart adjustment to the trip plan and return STRICT JSON { updatedPlan, note }.
Action: ${JSON.stringify(action)}
Plan JSON:
${JSON.stringify(plan)}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a trip customization assistant. Always return strict JSON only.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1000,
      temperature: 0.6,
    });

    const aiResponse = completion.choices[0]?.message?.content || '{}';
    let parsed;
    try { parsed = JSON.parse(aiResponse); } catch {
      const trimmed = aiResponse.replace(/^```[a-zA-Z]*\n?|```$/g, '').trim();
      try { parsed = JSON.parse(trimmed); } catch { parsed = null; }
    }
    if (!parsed) return res.status(502).json({ success: false, error: 'Invalid AI response' });
    res.json({ success: true, data: parsed, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Smart Adjust Error:', error);
    res.status(500).json({ success: false, error: 'Failed to apply smart adjustment', message: 'Please try again later' });
  }
});

// AI Booking Recommendations endpoint
app.post('/api/ai/booking-recommendations', async (req, res) => {
  try {
    const { from, to, date, type, preferences } = req.body;

    const prompt = `Provide booking recommendations for ${type} travel from ${from} to ${to} on ${date}.

Preferences: ${preferences}

Please suggest:
1. Best booking platforms for this route
2. Optimal timing for bookings
3. Cost-saving tips
4. Alternative options
5. What to expect for pricing

Focus on Indian travel booking platforms and realistic pricing in Indian Rupees.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are an expert on Indian travel bookings. Provide practical advice on flights, trains, and hotels in India." },
        { role: "user", content: prompt }
      ],
      max_tokens: 600,
      temperature: 0.7,
    });

    const aiResponse = completion.choices[0]?.message?.content || "Unable to provide recommendations";

    res.json({
      success: true,
      recommendations: aiResponse,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Booking Recommendations Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recommendations',
      message: 'Please try again later'
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 WanderWise API Server running on port ${PORT}`);
  console.log(`🤖 OpenAI integration: ${process.env.OPENAI_API_KEY ? 'Connected' : 'Not configured'}`);
});

export default app;
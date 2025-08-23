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

// AI Trip Planning endpoint
app.post('/api/ai/plan-trip', async (req, res) => {
  try {
    const { from, to, startDate, endDate, budget, travelers, interests } = req.body;

    const prompt = `Create a detailed travel itinerary for a trip from ${from} to ${to} from ${startDate} to ${endDate}.

Trip Details:
- Budget: ₹${budget} for ${travelers} travelers
- Interests: ${interests.join(', ')}

Please provide:
1. Day-wise detailed itinerary with specific activities
2. Estimated costs for each activity in Indian Rupees
3. Accommodation suggestions
4. Local transportation recommendations
5. Food and dining suggestions
6. Cultural insights and tips

Format the response as a structured JSON with days, activities, costs, and descriptions.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are an expert Indian travel planner. Provide detailed, practical itineraries with accurate cost estimates in Indian Rupees." },
        { role: "user", content: prompt }
      ],
      max_tokens: 1500,
      temperature: 0.7,
    });

    const aiResponse = completion.choices[0]?.message?.content || "Unable to generate itinerary";

    res.json({
      success: true,
      itinerary: aiResponse,
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
# Workforce Intelligence Platform

A comprehensive AI-powered workforce analytics platform that provides natural language querying, automated app classification, and detailed productivity insights for modern organizations.

## **Project Overview**

This platform enables organizations to gain deep insights into workforce productivity through:

- **Natural Language Queries**: Ask questions in plain English about team productivity, app usage, and performance metrics
- **Automated App Classification**: AI-powered classification of applications as productive, neutral, or unproductive
- **Real-time Analytics**: Comprehensive dashboards and reports on workforce utilization
- **RBAC Security**: Role-based access control with Admin, Manager, and Employee permissions
- **Learning System**: Continuous improvement through user feedback and classification overrides

## **Tech Stack**

### **Backend**
- **Node.js** with **TypeScript** for type safety
- **Express.js** for REST API
- **PostgreSQL** with pgvector extension enabled
- **JWT** for authentication
- **bcrypt** for password hashing

### **AI/ML**

- **Groq API** (Llama models) for natural language processing
- **LLM-powered classification** with confidence scoring and feedback learning

### **Frontend**

- **React** with **TypeScript**
- **Modern CSS** with responsive design
- **RESTful API integration**

### **Development Tools**

- **tsx** for development
- **TypeScript** for compilation
- **ESLint** for code quality
- **Git** for version control

## 🏗️ **Architecture**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React UI      │    │  Express API    │    │  PostgreSQL     │
│                 │◄──►│                 │◄──►│  Database       │
│ - Dashboards    │    │ - Auth          │    │                 │
│ - Chat Interface│    │ - Chat Agent    │    │ - Users         │
│ - Admin Panels  │    │ - Classification│    │ - Daily Usage   │
│ - Reports       │    │ - RBAC          │    │ - App Usage     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   Groq API      │
                       │                 │
                       │ - Llama Models  │
                       │ - Text Analysis │
                       │ - Classification│
                       └─────────────────┘
```

## **Seed Data Overview**

The platform includes comprehensive seed data covering **6 months** of workforce activity (180 days) to demonstrate realistic analytics scenarios.

### **Data Structure**

#### **Users (200 total)**

- **5 Admins**: Full system access, classification management
- **20 Managers**: Team oversight, classification approvals
- **175 Employees**: Individual productivity tracking

#### **Teams (10 total)**

- **5 Departments**: Engineering, Marketing, Sales, Finance, HR
- **2 Teams per Department**: Balanced distribution across roles

#### **Applications (46 pre-classified apps)**

- **Productive (22 apps)**: VS Code, Jira, Slack, Figma, etc.
- **Neutral (13 apps)**: Chrome, Calendar, Notes, etc.
- **Unproductive (11 apps)**: YouTube, Facebook, Steam, etc.

#### **Time Period: January 1, 2025 - June 29, 2025**

- **180 days** of historical data
- **Realistic patterns**: Weekends off, varying productivity
- **Seasonal variations**: Different activity levels by month

### **Data Volume**

- **27,071 daily usage records** (200 users × ~135 working days)
- **219,472 app usage records** (200 users × 180 days × ~6 apps/day)
- **50,510 project time records** (200 users × 180 days × ~1-3 projects/day)

### **Usage Patterns**

- **Work hours**: 6-10 hours weekdays, 1-3 hours weekends
- **Productivity**: 50-80% base rate with daily variations
- **App diversity**: 8-15 apps per user with realistic preferences
- **Project allocation**: 60-90% time on billable projects

## **AI Agents Breakdown**

## **1. Chat Agent - Natural Language Query Processing**

The Chat Agent enables users to ask questions in plain English and receive structured analytics insights.

### **Core Components**

#### **Parser (`src/agents/chat/parser.ts`)**

- **Input**: Natural language queries
- **Output**: Structured `ParsedQuery` with intent, metrics, filters, date ranges
- **Features**:
  - Intent classification (summary, comparison, trend, drill-down, list)
  - Metric extraction (total_duration, productive_duration, etc.)
  - Filter parsing (teams, users, projects, apps)
  - Advanced date range parsing with fuzzy matching
  - Conversation context awareness

#### **SQL Generator (`src/agents/chat/sqlGenerator.ts`)**

- **Input**: Parsed query + user context
- **Output**: PostgreSQL queries with RBAC filtering
- **Features**:
  - Dynamic RBAC (Admin: all data, Manager: team data, Employee: personal data)
  - Fuzzy team name matching for natural queries
  - Optimized queries with proper indexing
  - Date range conversion and validation

#### **Explainer (`src/agents/chat/explainer.ts`)**

- **Input**: SQL results + original query
- **Output**: Natural language explanations with proper formatting
- **Features**:
  - Number formatting (35,881 hours, 78.5%)
  - Contextual explanations
  - Markdown formatting for readability
  - Error handling for empty results

### **Supported Query Types**

```sql
-- Summary Queries
"How many total hours were worked last month?"
"What was the average productivity rate last week?"

-- Comparison Queries
"Compare productivity between Engineering and Marketing teams"
"Show app usage differences across departments"

-- Trend Analysis
"How has productivity changed over the last 30 days?"
"Track project time allocation trends"

-- Drill-down Queries
"Which apps are most used by the Engineering team?"
"Top 10 users by productive hours this month"

-- List Queries
"List out projects" (shows all projects with billable status)
"List teams" (shows all teams by department)
"List users" (shows all users with roles - RBAC filtered)
"Show classification rules" (shows all app classification rules)
"Show all projects worked on last week" (filtered by date)
"List team members and their roles" (RBAC filtered)
```

### **RBAC Implementation**

```typescript
// Admin: No restrictions
WHERE 1=1

// Manager: Team data only
WHERE user_id IN (
  SELECT id FROM users WHERE team_id = '${user.team_id}'
)

// Employee: Personal data only
WHERE user_id = '${user.id}'
```

## **2. Classification Agent - Automated App Productivity Assessment**

The Classification Agent automatically categorizes applications based on usage patterns and organizational context.

### **Core Components**

#### **Main Controller (`src/agents/classification/index.ts`)**

- **Entry Point**: `classifyNewApp(appName, user)`
- **Workflow**:
  1. Check existing classification rules
  2. Analyze usage patterns if new
  3. LLM classification with confidence scoring
  4. Auto-approve or queue for human review

#### **Analyzer (`src/agents/classification/analyzer.ts`)**

- **Gathers comprehensive usage data**:
  - Total usage minutes and unique users
  - Average session duration and peak hours
  - Team and role distribution patterns
  - Similar existing apps for precedent analysis

#### **Classifier (`src/agents/classification/classifier.ts`)**

- **LLM-powered classification** using Groq API
- **Context-aware reasoning**:
  - Role-based expectations (YouTube: unproductive for Finance, potentially productive for Marketing)
  - Time-based patterns (breaks vs work hours)
  - Team norms and organizational culture

#### **Feedback System (`src/agents/classification/feedback.ts`)**

- **Learning from corrections**: When users override classifications
- **Dynamic thresholds**: Adjusts auto-approval confidence based on accuracy
- **Continuous improvement**: System learns from human feedback

### **Classification Workflow**

```
New App Detected
        ↓
Check Existing Rules
        ↓
   No Rule Found
        ↓
Analyze Usage Patterns
        ↓
LLM Classification
        ↓
High Confidence?
   Yes → Auto-approve
    ↓
   No → Queue for Review
        ↓
Manager/Admin Review
        ↓
Approve/Reject/Override
        ↓
Create Classification Rule
        ↓
Learning from Feedback
```

### **Classification Categories**

- **Productive**: Development tools, project management, work communication
- **Neutral**: Browsers, system utilities, general productivity apps
- **Unproductive**: Social media, entertainment, gaming applications

### **Confidence & Approval System**

```typescript
// Dynamic thresholds based on historical accuracy
const thresholds = await getAdjustedConfidenceThresholds();

// Auto-approve high confidence classifications
if (result.confidence >= thresholds.autoApprove) {
  // Create rule immediately
} else {
  // Queue for human review
}
```

## **Database Schema**

### **Core Tables**

```sql
-- Users and Teams
teams (id, name, department, manager_id)
users (id, email, password_hash, name, role, team_id)

-- Usage Data
daily_usage (user_id, date, total_duration, productive_duration, ...)
app_usage (user_id, date, app_name, category, duration, productivity_rating)
project_time (user_id, project_id, date, duration)

-- Projects
projects (id, name, billable)

-- Classification System
classification_rules (app_name, classification, confidence, reasoning)
pending_classifications (app_name, suggested_classification, confidence, status)
classification_feedback (rule_id, original_classification, corrected_classification)

-- Audit
agent_audit_log (agent_type, user_id, query, response, sql_generated, ...)
```

### **Key Relationships**

- **Users → Teams**: Many-to-one relationship
- **Daily Usage → Users**: Tracks daily productivity metrics
- **App Usage → Users**: Detailed application usage with productivity ratings
- **Project Time → Users/Projects**: Time tracking for billable work
- **Classification Rules**: Global and team-specific rules
- **Audit Log**: Complete traceability of AI agent actions

### **Future AI Features**

The database is prepared for advanced AI capabilities:
- **pgvector extension** enabled for vector embeddings
- **Embedding columns** ready for app similarity search
- **Vector indexes** configured for efficient similarity queries

## **API Endpoints**

### **Authentication**

```
POST /api/auth/login          # JWT token generation
GET  /api/auth/me             # Current user info
GET  /api/auth/users          # Sample users for testing
```

### **Chat & Analytics**

```
POST /api/chat                # Natural language queries
GET  /api/chat/examples       # Query examples
```

### **Classification Management**

```
POST /api/classifications/classify     # Classify new app
GET  /api/classifications/rules        # Get classification rules
GET  /api/classifications/pending      # Get pending classifications
POST /api/classifications/:id/approve  # Approve classification
POST /api/classifications/:id/reject   # Reject classification
```

### **Audit & Monitoring**

```
GET /api/audit                 # Agent action logs
```

## **Agent Logs & Auditing**

The platform maintains comprehensive audit logs for all AI agent activities to ensure transparency, debugging capabilities, and compliance.

### **Audit Log Features**

- **Complete Traceability**: Every AI agent interaction is logged with full context
- **Query Tracking**: Original user queries, parsed intents, generated SQL, and responses
- **Performance Metrics**: Response times, confidence scores, and processing details
- **Error Logging**: Failed operations with error details and stack traces
- **User Context**: User ID, role, team, and session information
- **Classification History**: App classification decisions with reasoning and confidence levels

### **Audit Log Structure**

```sql
agent_audit_log (
  id,                          -- Unique log entry ID
  agent_type,                  -- 'chat' | 'classification'
  user_id,                     -- User who triggered the action
  timestamp,                   -- When the action occurred
  query,                       -- Original user query (for chat)
  parsed_intent,               -- Parsed intent (for chat)
  sql_generated,               -- Generated SQL query (for chat)
  response,                    -- Agent response
  confidence_score,            -- Classification confidence (for classification)
  app_name,                    -- App being classified (for classification)
  classification,              -- Final classification result
  processing_time_ms,          -- Response time in milliseconds
  error_message,               -- Error details if failed
  success                       -- Boolean success indicator
)
```

### **Audit Log Access**

- **Admin**: Full access to all agent logs across the organization
- **Manager**: Access to logs for their team members' interactions
- **Employee**: Access to their own interaction logs only

### **Log Retention & Management**

- **Retention Period**: Logs retained for 2 years by default
- **Automatic Cleanup**: Old logs are archived or deleted based on policy
- **Export Capabilities**: Logs can be exported for compliance and analysis
- **Search & Filtering**: Advanced search by date range, user, agent type, and keywords

### **Use Cases**

- **Debugging**: Trace issues with specific queries or classifications
- **Performance Analysis**: Monitor agent response times and accuracy
- **Compliance**: Maintain audit trails for regulatory requirements
- **Usage Analytics**: Understand how the system is being used
- **Quality Assurance**: Review agent responses for continuous improvement

## **Setup Instructions**

### **Prerequisites**

```bash
Node.js 18+
PostgreSQL 14+
npm or yarn
```

### **Database Setup**

```bash
# Start PostgreSQL
brew services start postgresql  # macOS
sudo systemctl start postgresql # Linux

# Create database
createdb flowace

# Run setup script
npm run db:setup
```

### **Environment Configuration**

```bash
# Create .env file
cp .env.example .env

# Edit with your settings
GROQ_API_KEY=your_groq_api_key
JWT_SECRET=your_jwt_secret
DATABASE_URL=postgresql://user:password@localhost:5432/flowace
```

### **Installation & Seed**

```bash
# Install dependencies
npm install

# Seed database with test data
npm run seed

# Start development server
npm run dev

# Frontend (separate terminal)
cd react && npm install && npm run dev
```

### **Test Credentials**

```bash
# Admin user
Email: admin.user.1@company.com
Password: password123

# Manager user
Email: manager.1@company.com
Password: password123

# Employee user
Email: employee.1@company.com
Password: password123
```

## **Usage Examples**

### **Natural Language Queries**

```
"Show me productivity trends for the Engineering team last month"
"How many hours did the Marketing team spend on projects this week?"
"Compare app usage between managers and employees"
"Which applications are most used by productive employees?"
```

### **Classification Management**

```typescript
// Classify a new app
const result = await classifyApp("Notion");

// Check pending classifications
const pending = await getPendingClassifications();

// Approve with confidence
await approveClassification(pendingId, { overrideClassification: 'productive' });
```

### **Analytics Insights**

- **Productivity rates** by team, role, and time period
- **App usage patterns** with productivity categorization
- **Project time allocation** and billing analysis
- **Comparative analysis** across teams and departments
- **Trend analysis** with historical data

## **Testing**

### **API Testing**

```bash
# Health check
curl http://localhost:3000/health

# Authentication
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin.user.1@company.com","password":"password123"}'
```

### **Query Testing**

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"query":"How many total hours were worked last month?"}'
```

### **Database Verification**

```bash
# Check seeded data
npm run seed  # Shows data counts
```

## 🔒 **Security Features**

- **JWT Authentication** with role-based access
- **RBAC Implementation** (Admin/Manager/Employee roles)
- **SQL Injection Prevention** with parameterized queries
- **Input Validation** on all endpoints
- **Audit Logging** for all AI agent actions

## 📈 **Performance & Scalability**

- **Batch Processing** for large data imports
- **Database Indexing** on common query patterns
- **Connection Pooling** with pg library
- **Efficient Queries** with proper RBAC filtering
- **pgvector Ready** for future AI enhancements

## 🎯 **Key Achievements**

✅ **Natural Language Processing**: Complex queries in plain English
✅ **Automated Classification**: AI-powered app productivity assessment
✅ **Comprehensive Analytics**: 6 months of realistic workforce data
✅ **Learning System**: Continuous improvement through feedback
✅ **Production Ready**: RBAC, audit trails, error handling
✅ **Modern Tech Stack**: TypeScript, PostgreSQL, LLM integration

## 📞 **Contact**

This project demonstrates expertise in:
- **AI/ML Integration** with modern LLMs
- **Full-Stack Development** with modern best practices
- **Data Engineering** with PostgreSQL and analytics
- **System Architecture** with scalable, maintainable design
- **User Experience** with intuitive interfaces

The platform provides actionable workforce insights through intelligent automation and natural interaction patterns.

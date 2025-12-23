# Event-to-Action Mapping System

## Overview

The orchestration-builder.html now supports comprehensive event-to-action mapping with dynamic payload integration, SQL parameterization, and AI-assisted mapping suggestions.

## Features Implemented

### 1. Event Binding System

- **Add Event Triggers**: Click "Add Event" button in the Event Triggers section
- **Event Selection Modal**: Shows all available events with descriptions
- **Multiple Events**: Bind multiple events to a single action (many-to-many)
- **Payload Schema Detection**: Automatically extracts field types from event schemas
- **Visual Field Pills**: Click on field pills to insert `{{event.fieldName}}` into SQL

### 2. SQL Parameterization

- **Template Syntax**: Use `{{event.fieldName}}` in your SQL queries
- **Auto-Detection**: Variables are automatically detected as you type
- **Type Information**: Shows field types and source events
- **Visual Feedback**: Parameters highlighted in Variable Mapping section

### 3. Variable Mapping

- **Automatic Mapping**: Shows all detected parameters from your SQL
- **Field Validation**: Verifies parameters exist in bound event payloads
- **Type Display**: Shows data type for each parameter
- **Source Tracking**: Indicates which event provides each field

### 4. Preview & Test Execution

- **Sample Data Input**: Provide JSON sample event data
- **Variable Substitution**: Automatically replaces `{{event.field}}` with actual values
- **SQL Preview**: Shows the processed SQL before execution
- **Live Execution**: Runs the query against your database
- **Result Display**: Shows query results in a formatted table

### 5. AI-Assisted Mapping

- **Context-Aware Suggestions**: AI analyzes your event schemas and description
- **Smart Query Generation**: Generates SQL with proper `{{event.field}}` placeholders
- **One-Click Application**: Suggested query auto-fills the SQL field
- **Parameter Auto-Detection**: Triggers variable mapping after AI suggestion

## How to Use

### Step 1: Create an Action with Event Binding

1. Enter a unique action name
2. Write a description of what the action should do
3. Click **"Add Event"** in the Event Triggers section
4. Select the event(s) that should trigger this action
5. View the event payload fields displayed as blue pills

### Step 2: Write SQL with Parameters

**Manual Entry:**

```sql
INSERT INTO users (id, name, status)
VALUES ({{event.userId}}, {{event.userName}}, {{event.status}})
```

**Or Click Field Pills:** Click on any blue field pill to insert `{{event.fieldName}}`

**Or Use AI Suggestion:** Click "✨ AI Suggest Mapping" for AI-generated SQL

### Step 3: Verify Variable Mapping

- Check the **Variable Mapping** section
- Ensure all parameters match fields from bound events
- View parameter types and source events

### Step 4: Test Execution

1. Expand **Preview & Test** section
2. Enter sample JSON event data:

```json
{
  "userId": 123,
  "userName": "John Doe",
  "status": "active"
}
```

3. Click **"▶ Run Test"**
4. Review the processed SQL and execution results

## Example Workflow

### Creating a User Registration Action

**Event:** `user.registered`
**Payload Schema:**

- `id` (number)
- `email` (string)
- `name` (string)
- `timestamp` (datetime)

**SQL Query:**

```sql
INSERT INTO users (user_id, email, full_name, created_at, status)
VALUES ({{event.id}}, {{event.email}}, {{event.name}}, {{event.timestamp}}, 'active')
```

**Sample Test Data:**

```json
{
  "id": 456,
  "email": "jane@example.com",
  "name": "Jane Smith",
  "timestamp": "2024-02-12T10:30:00Z"
}
```

**Processed SQL:**

```sql
INSERT INTO users (user_id, email, full_name, created_at, status)
VALUES (456, 'jane@example.com', 'Jane Smith', '2024-02-12T10:30:00Z', 'active')
```

## Advanced Features

### Many-to-Many Mapping

- Bind multiple events to one action
- Access fields from different events using `{{event.fieldName}}`
- System automatically resolves which event provides each field

### Dynamic Orchestration

- Events trigger actions automatically at runtime
- Payload data dynamically substituted into SQL
- No hardcoding required - fully data-driven

### AI Builder Capabilities

- Analyzes event schemas and business descriptions
- Generates optimized SQL with proper parameterization
- Suggests best practices for field mapping
- Handles complex queries with multiple tables and joins

### Real-Time Preview

- Test before deploying
- Validate with realistic sample data
- See actual SQL that will execute
- Preview query results

## Tips for Non-Technical Users

1. **Start Simple**: Bind one event, use basic SQL
2. **Use AI Assistance**: Let AI generate the SQL for you
3. **Test Early**: Use Preview & Test with every change
4. **Click Field Pills**: Easier than typing `{{event.fieldName}}`
5. **Check Mapping**: Verify all variables are green in Variable Mapping section

## Error Messages

- **"Missing field X in sample data"**: Add the field to your test JSON
- **"Invalid JSON in sample event data"**: Check JSON syntax in test data
- **"Event already bound"**: You've already added this event
- **"No events connected"**: Click "Add Event" to bind events first

## Data Flow

```
Event Fired → Event Payload → Variable Substitution → SQL Execution → Result
     ↓              ↓                    ↓                    ↓            ↓
user.created  {userId:123}     WHERE id={{event.userId}}  WHERE id=123  Row returned
```

## Troubleshooting

**Variables not detected?**

- Ensure you use exact syntax: `{{event.fieldName}}`
- Check for typos in field names

**Test execution fails?**

- Verify sample JSON is valid
- Ensure all `{{event.fields}}` have values in sample data
- Check table name exists in FROM clause

**AI suggestion not working?**

- Enter a detailed description first
- Bind at least one event
- Check AI service is configured correctly

## Integration with Existing Features

- **DB Explorer**: Click columns to insert into Description (not SQL)
- **Name Validation**: Duplicate names highlighted in red
- **Field Gating**: All fields locked until unique name entered
- **Auto-save**: Changes saved automatically as you type
- **Event Bindings Persist**: Saved with action and restored on edit

## Future Enhancements

- Conditional logic for event field values
- Multi-step transactions with event chains
- Event filtering before action trigger
- Batch processing for multiple events
- Dead letter queue for failed executions

---

**Version:** 1.0  
**Last Updated:** 2024-02-12  
**Status:** ✅ Fully Implemented

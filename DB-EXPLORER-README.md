# Database Explorer & Schema Discovery Tool

## 🎯 Overview

A comprehensive database exploration and analysis tool that provides:

- **Complete Schema Discovery**: View all tables, columns, data types, constraints
- **Metadata Analysis**: Detailed statistics about your database structure
- **Relationship Mapping**: Foreign key relationships and data lineage
- **AI-Powered Analysis**: Natural language queries and intelligent insights
- **Decoupled Architecture**: Separate database loading from AI analysis

## 🚀 Features

### 1. Database Connection & Loading

- Connect to your MySQL database with one click
- Automatic schema discovery and metadata extraction
- Real-time connection status monitoring

### 2. Schema Discovery

**Tables Overview:**

- Visual grid of all database tables
- Row counts and column counts for each table
- Multi-select capability for focused analysis

**Detailed Schema Information:**

- **Columns Tab**: Complete column definitions with data types, constraints (PRIMARY KEY, FOREIGN KEY, UNIQUE, NOT NULL, AUTO_INCREMENT)
- **Relationships Tab**: Foreign key relationships between tables
- **Indexes Tab**: All indexes including unique and composite indexes
- **Data Lineage Tab**: Visual representation of table relationships and data flow

### 3. Database Statistics

Real-time dashboard showing:

- Total number of tables
- Total columns across all tables
- Total rows in database
- Total indexes

### 4. AI-Powered Analysis

**Natural Language Queries:**

- Ask questions about your data in plain English
- Automatic SQL generation from natural language
- Intelligent query execution and result display

**Examples:**

- "Show me all users created in the last month"
- "What are the top 10 products by sales?"
- "Find customers with more than 5 orders"
- "Analyze the relationship between orders and customers"

### 5. Advanced Metadata Discovery

**Table-Level Metadata:**

- Storage engine (InnoDB, MyISAM, etc.)
- Average row length
- Data and index sizes
- Creation and last update timestamps
- Character set and collation

**Database-Wide Analytics:**

- Column type distribution
- Relationship graphs
- Data flow visualization
- Storage usage statistics

## 📋 Usage

### Step 1: Connect to Database

1. Open the explorer: `http://localhost:3000/explorer`
2. Click "Connect to Database"
3. Wait for automatic schema discovery

### Step 2: Explore Schema

1. Browse the complete list of tables
2. Click on any table to view detailed information
3. Switch between tabs to see:
   - Column definitions
   - Foreign key relationships
   - Index information
   - Data lineage

### Step 3: Select Tables for Analysis

1. Check the boxes for tables you want to analyze
2. Use "Select All" / "Deselect All" for convenience
3. View detailed schema for selected tables

### Step 4: Start AI Analysis

1. Click "Start AI Analysis"
2. Ask questions in natural language
3. AI will:
   - Generate appropriate SQL queries
   - Execute queries safely
   - Display results in formatted tables
   - Provide insights and explanations

## 🔧 API Endpoints

### Database Schema

```
GET /database
Response: { tables: ["table1", "table2", ...] }
```

### Detailed Table Schema

```
GET /api/schema/:tableName
Response: {
  tableName: string,
  columns: [...],
  rowCount: number,
  foreignKeys: [...],
  indexes: [...],
  stats: {...}
}
```

### Database Metadata

```
GET /api/metadata
Response: {
  database: {...},
  tables: [...],
  relationships: [...],
  columnStats: [...],
  totalTables: number,
  totalRows: number
}
```

### Table Lineage

```
GET /api/lineage/:tableName
Response: {
  tableName: string,
  outgoing: [...],  // Tables this table references
  incoming: [...],  // Tables that reference this table
  totalRelationships: number
}
```

### Connection Test

```
GET /api/testConnection
Response: { status: "connected", config: {...} }
```

## 🎨 Architecture

### Decoupled Design

**Phase 1: Database Loading (Independent)**

- Connects to database
- Discovers schema
- Loads metadata
- No AI involvement
- Fast and reliable

**Phase 2: AI Analysis (Optional)**

- Starts only when user is ready
- Works with selected tables
- Can be debugged separately
- Uses external AI service

### Benefits

1. **Faster Initial Load**: No waiting for AI services
2. **Better Debugging**: Isolate database vs AI issues
3. **Flexible Workflow**: Explore schema before analysis
4. **Resource Efficient**: Only use AI when needed

## 🔍 Schema Discovery Details

### Column Information

For each column, discover:

- Name and data type
- NULL/NOT NULL constraint
- Default values
- Character set and collation
- Extra attributes (AUTO_INCREMENT, etc.)
- Key types (PRIMARY, FOREIGN, UNIQUE)

### Relationship Discovery

Automatically identifies:

- Foreign key constraints
- Referenced tables and columns
- Constraint names
- Update/delete rules

### Index Analysis

Identifies:

- Primary keys
- Unique indexes
- Composite indexes
- Index types (BTREE, HASH, FULLTEXT)
- Index cardinality

### Data Lineage

Visualizes:

- Parent-child relationships
- Data flow direction
- Multi-level dependencies
- Circular references (if any)

## 💡 Use Cases

### 1. Database Documentation

- Generate complete schema documentation
- Understand legacy databases
- Onboard new team members

### 2. Data Analysis

- Explore data relationships
- Find data quality issues
- Identify optimization opportunities

### 3. Query Building

- Visual schema reference while writing queries
- Understand table relationships
- Find relevant columns quickly

### 4. Migration Planning

- Assess database complexity
- Identify dependencies
- Plan data migration strategies

### 5. Performance Optimization

- Analyze index usage
- Identify missing indexes
- Review table statistics

## 🛠️ Technical Stack

- **Frontend**: Vanilla JavaScript, jQuery, Bootstrap 5
- **Backend**: Node.js, Express.js
- **Database**: MySQL/MariaDB
- **AI**: External AI service (gradio-hugginface-aiserver)
- **Styling**: Custom CSS with modern design

## 🔐 Security

- Read-only schema queries by default
- Query sanitization and validation
- Session-based AI conversations
- No direct SQL injection risks
- Timeout protection on long queries

## 📊 Performance

- Lazy loading of detailed schema
- Efficient metadata queries
- Pagination for large result sets
- Connection pooling
- Query result caching

## 🐛 Debugging

### If Database Won't Connect:

1. Check server is running: `node server.js`
2. Verify database config in `config/database.json`
3. Test connection manually: `http://localhost:3000/api/testConnection`

### If Schema Won't Load:

1. Check console for errors
2. Verify database user has schema read permissions
3. Ensure tables exist in the database

### If AI Analysis Fails:

1. Verify AI service is accessible
2. Check network connectivity
3. Review session ID in browser console
4. Database loading still works independently

## 🚦 Getting Started

1. **Start the server:**

   ```bash
   node server.js
   ```

2. **Open the explorer:**

   ```
   http://localhost:3000/explorer
   ```

3. **Connect and explore:**
   - Click "Connect to Database"
   - Browse tables and schema
   - Select tables to analyze
   - Start AI-powered queries

## 📝 Notes

- First load may take a few seconds for large databases
- AI analysis requires internet connection
- Query results limited to 100 rows for display
- All schema queries are read-only
- Session data persists across page refreshes

## 🎯 Future Enhancements

- Export schema as SQL/JSON
- Visual ER diagram generation
- Query history and favorites
- Scheduled metadata snapshots
- Performance metrics tracking
- Custom report generation

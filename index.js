const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(express.json());
app.use(cors());

// Database setup
const dbPath = path.join(__dirname, 'contacts.db');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fullName TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      cell TEXT,
      registeredDate TEXT NOT NULL,
      age INTEGER,
      street_number INTEGER,
      street_name TEXT,
      city TEXT,
      country TEXT,
      picture_large TEXT,
      picture_medium TEXT,
      picture_thumbnail TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// Helper function to transform database row to IContact format
function transformDbRowToContact(row) {
  return {
    id: row.id.toString(),
    fullName: row.fullName,
    address: {
      street: {
        number: row.street_number,
        name: row.street_name
      },
      city: row.city,
      country: row.country
    },
    email: row.email,
    phone: row.phone,
    cell: row.cell,
    registeredDate: new Date(row.registeredDate),
    age: row.age,
    picture: {
      large: row.picture_large,
      medium: row.picture_medium,
      thumbnail: row.picture_thumbnail
    }
  };
}

// Helper function to transform IContact to database format
function transformContactToDbFormat(contact) {
  // Handle registeredDate - it can be a Date object or a string
  let registeredDateISO;
  if (contact.registeredDate instanceof Date) {
    registeredDateISO = contact.registeredDate.toISOString();
  } else if (typeof contact.registeredDate === 'string') {
    // Validate that it's a valid date string
    const dateObj = new Date(contact.registeredDate);
    if (isNaN(dateObj.getTime())) {
      throw new Error('Invalid registeredDate format. Use ISO string format: YYYY-MM-DDTHH:mm:ss.sssZ');
    }
    registeredDateISO = dateObj.toISOString();
  } else {
    throw new Error('registeredDate must be a Date object or ISO date string');
  }

  return {
    fullName: contact.fullName,
    email: contact.email,
    phone: contact.phone,
    cell: contact.cell,
    registeredDate: registeredDateISO,
    age: contact.age,
    street_number: contact.address.street.number,
    street_name: contact.address.street.name,
    city: contact.address.city,
    country: contact.address.country,
    picture_large: contact.picture.large,
    picture_medium: contact.picture.medium,
    picture_thumbnail: contact.picture.thumbnail
  };
}

// GET /api/contacts - Get all contacts
app.get('/api/contacts', (req, res) => {
  const query = 'SELECT * FROM contacts ORDER BY created_at DESC';
  
  db.all(query, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    const contacts = rows.map(transformDbRowToContact);
    res.json({
      success: true,
      data: contacts,
      count: contacts.length
    });
  });
});

// GET /api/contacts/:id - Get contact by ID
app.get('/api/contacts/:id', (req, res) => {
  const { id } = req.params;
  const query = 'SELECT * FROM contacts WHERE id = ?';
  
  db.get(query, [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!row) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    const contact = transformDbRowToContact(row);
    res.json({
      success: true,
      data: contact
    });
  });
});

// POST /api/contacts - Create new contact
app.post('/api/contacts', (req, res) => {
  try {
    console.log('Received request body:', JSON.stringify(req.body, null, 2));
    const contact = req.body;
    
    // Validate required fields
    if (!contact.fullName || !contact.email || !contact.address || !contact.picture) {
      console.log('Missing required fields. Contact object:', contact);
      return res.status(400).json({ 
        error: 'Missing required fields: fullName, email, address, picture',
        received: contact
      });
    }
    
    // Validate nested address structure
    if (!contact.address.street || !contact.address.street.number || !contact.address.street.name) {
      return res.status(400).json({
        error: 'Invalid address structure. Required: address.street.number and address.street.name'
      });
    }
    
    // Validate nested picture structure
    if (!contact.picture.large || !contact.picture.medium || !contact.picture.thumbnail) {
      return res.status(400).json({
        error: 'Invalid picture structure. Required: picture.large, picture.medium, picture.thumbnail'
      });
    }
    
    // Validate registeredDate
    if (!contact.registeredDate) {
      return res.status(400).json({
        error: 'registeredDate is required'
      });
    }
    
    const dbData = transformContactToDbFormat(contact);
    
    const query = `
      INSERT INTO contacts (
        fullName, email, phone, cell, registeredDate, age,
        street_number, street_name, city, country,
        picture_large, picture_medium, picture_thumbnail
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      dbData.fullName, dbData.email, dbData.phone, dbData.cell,
      dbData.registeredDate, dbData.age, dbData.street_number,
      dbData.street_name, dbData.city, dbData.country,
      dbData.picture_large, dbData.picture_medium, dbData.picture_thumbnail
    ];
    
    db.run(query, params, function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Get the created contact
      db.get('SELECT * FROM contacts WHERE id = ?', [this.lastID], (err, row) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        
        const contact = transformDbRowToContact(row);
        res.status(201).json({
          success: true,
          data: contact,
          message: 'Contact created successfully'
        });
      });
    });
  } catch (error) {
    console.error('Error creating contact:', error);
    res.status(400).json({ 
      error: 'Invalid request data',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// PUT /api/contacts/:id - Update contact
app.put('/api/contacts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const contact = req.body;
    
    // Validate required fields
    if (!contact.fullName || !contact.email || !contact.address || !contact.picture) {
      return res.status(400).json({ 
        error: 'Missing required fields: fullName, email, address, picture' 
      });
    }
    
    const dbData = transformContactToDbFormat(contact);
    
    const query = `
      UPDATE contacts SET 
        fullName = ?, email = ?, phone = ?, cell = ?, registeredDate = ?, age = ?,
        street_number = ?, street_name = ?, city = ?, country = ?,
        picture_large = ?, picture_medium = ?, picture_thumbnail = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    const params = [
      dbData.fullName, dbData.email, dbData.phone, dbData.cell,
      dbData.registeredDate, dbData.age, dbData.street_number,
      dbData.street_name, dbData.city, dbData.country,
      dbData.picture_large, dbData.picture_medium, dbData.picture_thumbnail,
      id
    ];
    
    db.run(query, params, function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Contact not found' });
      }
      
      // Get the updated contact
      db.get('SELECT * FROM contacts WHERE id = ?', [id], (err, row) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        
        const contact = transformDbRowToContact(row);
        res.json({
          success: true,
          data: contact,
          message: 'Contact updated successfully'
        });
      });
    });
  } catch (error) {
    res.status(400).json({ error: 'Invalid request data' });
  }
});

// DELETE /api/contacts/:id - Delete contact
app.delete('/api/contacts/:id', (req, res) => {
  const { id } = req.params;
  const query = 'DELETE FROM contacts WHERE id = ?';
  
  db.run(query, [id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    res.json({
      success: true,
      message: 'Contact deleted successfully'
    });
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Connected to SQLite database`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Database connection closed.');
    process.exit(0);
  });
});

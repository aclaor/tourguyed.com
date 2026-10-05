-- TourGuyed D1 schema. Apply with: npx wrangler d1 execute tourguyed-db --remote --file=schema.sql
DROP TABLE IF EXISTS users; DROP TABLE IF EXISTS sessions; DROP TABLE IF EXISTS guides;
DROP TABLE IF EXISTS availability; DROP TABLE IF EXISTS bookings; DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS reviews; DROP TABLE IF EXISTS blocks; DROP TABLE IF EXISTS tickets; DROP TABLE IF EXISTS invites; DROP TABLE IF EXISTS media;

CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL CHECK(role IN('tourist','guide','admin')),
 email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, pass TEXT NOT NULL, id_status TEXT DEFAULT 'none', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE guides(user_id INTEGER PRIMARY KEY, photo TEXT, bio TEXT, gender TEXT, occupation TEXT, school TEXT,
 is_student INTEGER DEFAULT 0, school_permission INTEGER DEFAULT 0, location TEXT, places TEXT DEFAULT '[]',
 languages TEXT DEFAULT '[]', activities TEXT DEFAULT '[]', transport TEXT, package_title TEXT, price REAL DEFAULT 0,
 duration_hours REAL DEFAULT 3, includes TEXT DEFAULT '[]', excludes TEXT DEFAULT '[]', wise_email TEXT,
 offers_local INTEGER DEFAULT 0, verified INTEGER DEFAULT 0, rating REAL DEFAULT 0, reviews INTEGER DEFAULT 0,
 accepted INTEGER DEFAULT 0, declined INTEGER DEFAULT 0, media TEXT DEFAULT '[]', invited_by INTEGER);
CREATE TABLE availability(id INTEGER PRIMARY KEY AUTOINCREMENT, guide_id INTEGER, day TEXT, slot TEXT, UNIQUE(guide_id,day,slot));
CREATE TABLE bookings(id INTEGER PRIMARY KEY AUTOINCREMENT, tourist_id INTEGER, guide_id INTEGER, day TEXT, slot TEXT,
 timeline TEXT, pay_method TEXT CHECK(pay_method IN('cash','online')), amount REAL, platform_fee REAL,
 status TEXT DEFAULT 'requested', payout_status TEXT DEFAULT 'pending', refund REAL DEFAULT 0, decline_reason TEXT, pm_checkout TEXT, pm_payment TEXT, guide_paid REAL DEFAULT 0,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE messages(id INTEGER PRIMARY KEY AUTOINCREMENT, booking_id INTEGER, sender_id INTEGER, body TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE reviews(booking_id INTEGER PRIMARY KEY, guide_id INTEGER, tourist_id INTEGER, stars INTEGER, comment TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE blocks(tourist_id INTEGER, guide_id INTEGER, PRIMARY KEY(tourist_id,guide_id));
CREATE TABLE tickets(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, subject TEXT, body TEXT, status TEXT DEFAULT 'open', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE invites(id INTEGER PRIMARY KEY AUTOINCREMENT, guide_id INTEGER, email TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE media(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, kind TEXT, key TEXT, data TEXT, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP);

-- Demo guides (password for all demo accounts: demo1234)
INSERT INTO users(id,role,email,name,pass,id_status) VALUES
(1,'guide','mia@demo.tourguyed.com','Mia Santos','DEMO','verified'),
(2,'guide','carlo@demo.tourguyed.com','Carlo Reyes','DEMO','verified'),
(3,'guide','aira@demo.tourguyed.com','Aira Lim','DEMO','verified'),
(4,'guide','josh@demo.tourguyed.com','Josh Tan','DEMO','verified');
INSERT INTO guides(user_id,photo,bio,gender,occupation,school,is_student,school_permission,location,places,languages,activities,transport,package_title,price,duration_hours,includes,excludes,verified,rating,reviews,accepted,declined,media) VALUES
(1,'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=700&q=75','History lover who shows visitors hidden streets, museums and classic Manila food spots.','Female','Student','University of the Philippines Manila',1,1,'Manila','["UP Manila campus","Intramuros","Binondo"]','["English","Filipino"]','["History","Food","Walking"]','Walking + jeepney','Old Manila Heritage Walk',950,4,'["Guide fee","Bottled water"]','["Meals","Entrance fees","Transport"]',1,4.9,128,140,3,'["https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?auto=format&fit=crop&w=700&q=75"]'),
(2,'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=700&q=75','Professional guide for food trips, city views and nightlife.','Male','Professional guide','',0,0,'Makati & BGC','["Poblacion","BGC High Street","Salcedo Market"]','["English","Filipino"]','["Food","Nightlife","Shopping"]','Car','Makati Food Crawl',1500,5,'["Guide fee","Car","2 tastings"]','["Drinks","Shopping"]',1,4.8,96,100,8,'[]'),
(3,'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=700&q=75','Student guide for Cebu heritage, beaches and local eats.','Female','Student','Cebu Normal University',1,1,'Cebu City','["CNU campus","Magellan''s Cross","Fort San Pedro"]','["English","Filipino","Cebuano"]','["Culture","Food","Beaches"]','Walking + taxi','Cebu Heritage Half-Day',1200,4,'["Guide fee","Snacks"]','["Entrance fees","Lunch"]',1,5.0,73,75,1,'[]'),
(4,'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=700&q=75','Island hopping and hiking guide, offers local boatmen partners.','Male','Boat operator','',0,0,'El Nido, Palawan','["Big Lagoon","Nacpan Beach","Taraw Cliff"]','["English","Filipino","Spanish"]','["Beaches","Hiking","Adventure"]','Boat + van','El Nido Lagoon Day',2500,8,'["Boat","Lunch","Snorkel gear"]','["Environmental fee","Kayak rental"]',1,4.7,54,60,5,'[]');

-- Demo availability: next 21 days, 3 slots/day for each demo guide
INSERT INTO availability(guide_id,day,slot)
WITH RECURSIVE d(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM d WHERE n<21)
SELECT g.user_id, date('now','+'||n||' days'), s.slot FROM d, guides g,
 (SELECT '09:00' slot UNION SELECT '13:00' UNION SELECT '17:00') s;
CREATE TABLE IF NOT EXISTS resets(token TEXT PRIMARY KEY, user_id INTEGER, expires INTEGER);
CREATE TABLE IF NOT EXISTS signals(id INTEGER PRIMARY KEY AUTOINCREMENT, booking_id INTEGER, sender_id INTEGER, type TEXT, data TEXT, created INTEGER);

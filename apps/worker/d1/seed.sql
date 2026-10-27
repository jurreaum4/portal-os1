-- Synthetic local demonstration portfolio. Never run against production.
INSERT OR IGNORE INTO products (id,name,description,stage,score,division_id,revenue,status) VALUES
('max-chess','MAX Chess','A new perspective on strategic play. Multiplayer chess built for the next generation.','Published',94,'max-games',18400,'On track'),
('max-runner','MAX Runner','An edge-powered endless running adventure with procedurally generated worlds.','Ready',88,'max-games',0,'On track'),
('pixel-worlds','Pixel Worlds','A shared canvas for building, exploring and playing together.','Build',86,'max-games',0,'On track'),
('life-streak','Life Streak','Build daily habits that last with small, meaningful challenges.','Discovery',81,'max-institute',0,'On track'),
('max-studio','MAX Studio','A streamlined creative workspace for video teams and independent storytellers.','Published',91,'max-media',12600,'On track'),
('frame-zero','Frame Zero','A documentary series exploring the intersection of culture and technology.','Specification',79,'max-media',0,'On track'),
('canvas','Canvas Collective','A curated digital gallery connecting emerging artists with a global audience.','Published',89,'max-art',8200,'On track'),
('generative','Generative Forms','An experimental collection of interactive generative artworks.','Simulation',76,'max-art',0,'Attention'),
('max-academy','MAX Academy','Practical learning paths for the next generation of creative builders.','Test',87,'max-institute',0,'On track'),
('open-research','Open Research','An open knowledge library for collaborative research and shared discovery.','Idea',72,'max-institute',0,'On track'),
('soundscape','Soundscape','Immersive audio experiences for focus, creativity and everyday moments.','Architecture',83,'max-media',0,'On track'),
('play-lab','Play Lab','An experimental playground for testing new interactive game mechanics.','Package',85,'max-games',0,'On track');
INSERT OR IGNORE INTO approvals (id,product_id,action,priority,risk) VALUES
('001','max-runner','Publish release candidate','High','Low'),
('002','max-academy','Approve curriculum review','Medium','Low'),
('003','generative','Review simulation variance','High','High');
INSERT OR IGNORE INTO activity (id,product_id,title,department,kind) VALUES
('seed-1','max-runner','MAX Runner is ready for a release decision','GOV','info'),
('seed-2','generative','Generative Forms needs a simulation review','ARCH','warning'),
('seed-3','max-academy','MAX Academy entered the QA queue','TEST','info'),
('seed-4','play-lab','Play Lab is preparing its release package','OPS','info');

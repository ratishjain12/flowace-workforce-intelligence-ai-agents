import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: 'localhost',
  user: 'postgres',
  password: 'root',
  database: 'flowace',
  port: 5432,
});

// Constants
const DEPARTMENTS = ['Engineering', 'Marketing', 'Sales', 'Finance', 'HR', 'Support'];
const TEAMS_PER_DEPT = 2; // ~12 teams total, we'll use 10

const APPS = {
  productive: [
    { name: 'VS Code', category: 'Development' },
    { name: 'IntelliJ IDEA', category: 'Development' },
    { name: 'GitHub', category: 'Development' },
    { name: 'Jira', category: 'Project Management' },
    { name: 'Confluence', category: 'Documentation' },
    { name: 'Notion', category: 'Documentation' },
    { name: 'Figma', category: 'Design' },
    { name: 'Slack', category: 'Communication' },
    { name: 'Microsoft Teams', category: 'Communication' },
    { name: 'Zoom', category: 'Communication' },
    { name: 'Google Docs', category: 'Productivity' },
    { name: 'Google Sheets', category: 'Productivity' },
    { name: 'Salesforce', category: 'CRM' },
    { name: 'HubSpot', category: 'CRM' },
    { name: 'Tableau', category: 'Analytics' },
    { name: 'Power BI', category: 'Analytics' },
    { name: 'Terminal', category: 'Development' },
    { name: 'Postman', category: 'Development' },
    { name: 'AWS Console', category: 'Cloud' },
    { name: 'Linear', category: 'Project Management' },
  ],
  neutral: [
    { name: 'Google Chrome', category: 'Browser' },
    { name: 'Safari', category: 'Browser' },
    { name: 'Firefox', category: 'Browser' },
    { name: 'Microsoft Edge', category: 'Browser' },
    { name: 'Finder', category: 'System' },
    { name: 'File Explorer', category: 'System' },
    { name: 'Calendar', category: 'Productivity' },
    { name: 'Mail', category: 'Communication' },
    { name: 'Notes', category: 'Productivity' },
    { name: 'Calculator', category: 'Utility' },
    { name: 'Preview', category: 'Utility' },
    { name: 'System Preferences', category: 'System' },
    { name: 'Spotify', category: 'Music' },
    { name: 'Apple Music', category: 'Music' },
  ],
  unproductive: [
    { name: 'YouTube', category: 'Entertainment' },
    { name: 'Netflix', category: 'Entertainment' },
    { name: 'Twitter/X', category: 'Social Media' },
    { name: 'Facebook', category: 'Social Media' },
    { name: 'Instagram', category: 'Social Media' },
    { name: 'Reddit', category: 'Social Media' },
    { name: 'TikTok', category: 'Social Media' },
    { name: 'Discord', category: 'Gaming' },
    { name: 'Steam', category: 'Gaming' },
    { name: 'Twitch', category: 'Entertainment' },
    { name: 'Amazon Shopping', category: 'Shopping' },
    { name: 'eBay', category: 'Shopping' },
  ],
};

const PROJECTS = [
  { name: 'Website Redesign', billable: true },
  { name: 'Mobile App v2', billable: true },
  { name: 'API Integration', billable: true },
  { name: 'Customer Portal', billable: true },
  { name: 'Data Pipeline', billable: true },
  { name: 'Marketing Campaign Q1', billable: true },
  { name: 'Sales Dashboard', billable: true },
  { name: 'CRM Migration', billable: true },
  { name: 'Internal Training', billable: false },
  { name: 'Documentation Update', billable: false },
  { name: 'Code Refactoring', billable: false },
  { name: 'Security Audit', billable: true },
  { name: 'Performance Optimization', billable: true },
  { name: 'Team Meetings', billable: false },
  { name: 'Onboarding', billable: false },
  { name: 'R&D Exploration', billable: false },
  { name: 'Client Support', billable: true },
  { name: 'Bug Fixes', billable: true },
  { name: 'Feature Development', billable: true },
  { name: 'Infrastructure Setup', billable: true },
];

// Utility functions
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomChoices<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function generateEmail(name: string): string {
  return `${name.toLowerCase().replace(/\s+/g, '.')}@company.com`;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

async function clearTables() {
  console.log('Clearing existing data...');
  await pool.query('TRUNCATE TABLE classification_feedback CASCADE');
  await pool.query('TRUNCATE TABLE agent_audit_log CASCADE');
  await pool.query('TRUNCATE TABLE pending_classifications CASCADE');
  await pool.query('TRUNCATE TABLE classification_rules CASCADE');
  await pool.query('TRUNCATE TABLE project_time CASCADE');
  await pool.query('TRUNCATE TABLE app_usage CASCADE');
  await pool.query('TRUNCATE TABLE daily_usage CASCADE');
  await pool.query('TRUNCATE TABLE projects CASCADE');
  await pool.query('TRUNCATE TABLE users CASCADE');
  await pool.query('TRUNCATE TABLE teams CASCADE');
}

async function seedTeams(): Promise<Map<string, string>> {
  console.log('Seeding teams...');
  const teamMap = new Map<string, string>();

  for (const dept of DEPARTMENTS.slice(0, 5)) { // 5 departments, 2 teams each = 10 teams
    for (let i = 1; i <= TEAMS_PER_DEPT; i++) {
      const teamName = `${dept} Team ${i}`;
      const result = await pool.query(
        'INSERT INTO teams (name, department) VALUES ($1, $2) RETURNING id',
        [teamName, dept]
      );
      teamMap.set(teamName, result.rows[0].id);
    }
  }

  console.log(`  Created ${teamMap.size} teams`);
  return teamMap;
}

async function seedUsers(teamMap: Map<string, string>): Promise<Map<string, { id: string; role: string; teamId: string }>> {
  console.log('Seeding users...');
  const userMap = new Map<string, { id: string; role: string; teamId: string }>();
  const passwordHash = await bcrypt.hash('password123', 10);
  const teams = Array.from(teamMap.entries());

  // Create 5 admins
  for (let i = 1; i <= 5; i++) {
    const name = `Admin User ${i}`;
    const email = generateEmail(name);
    const team = randomChoice(teams);

    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name, role, team_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [email, passwordHash, name, 'admin', team[1]]
    );
    userMap.set(name, { id: result.rows[0].id, role: 'admin', teamId: team[1] });
  }

  // Create 20 managers (2 per team)
  let managerIndex = 1;
  for (const [teamName, teamId] of teams) {
    for (let i = 0; i < 2; i++) {
      const name = `Manager ${managerIndex}`;
      const email = generateEmail(name);

      const result = await pool.query(
        'INSERT INTO users (email, password_hash, name, role, team_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [email, passwordHash, name, 'manager', teamId]
      );
      userMap.set(name, { id: result.rows[0].id, role: 'manager', teamId });

      // Set first manager as team manager
      if (i === 0) {
        await pool.query('UPDATE teams SET manager_id = $1 WHERE id = $2', [result.rows[0].id, teamId]);
      }
      managerIndex++;
    }
  }

  // Create 175 employees (distribute across teams)
  for (let i = 1; i <= 175; i++) {
    const name = `Employee ${i}`;
    const email = generateEmail(name);
    const team = teams[(i - 1) % teams.length];

    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name, role, team_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [email, passwordHash, name, 'employee', team[1]]
    );
    userMap.set(name, { id: result.rows[0].id, role: 'employee', teamId: team[1] });
  }

  console.log(`  Created ${userMap.size} users (5 admins, 20 managers, 175 employees)`);

  // Log credentials for testing
  console.log('\n🔐 Test Credentials:');
  console.log('Password for all users: password123\n');

  // Log admin credentials
  console.log('👑 Admins:');
  const admins = Array.from(userMap.entries()).filter(([, user]) => user.role === 'admin');
  admins.forEach(([name, user]) => {
    console.log(`  ${name}: ${generateEmail(name)}`);
  });

  // Log manager credentials (first 5 for brevity)
  console.log('\n👨‍💼 Managers (first 5):');
  const managers = Array.from(userMap.entries()).filter(([, user]) => user.role === 'manager');
  managers.slice(0, 5).forEach(([name, user]) => {
    console.log(`  ${name}: ${generateEmail(name)}`);
  });
  if (managers.length > 5) {
    console.log(`  ... and ${managers.length - 5} more managers`);
  }

  // Log employee credentials (first 5 for brevity)
  console.log('\n👷 Employees (first 5):');
  const employees = Array.from(userMap.entries()).filter(([, user]) => user.role === 'employee');
  employees.slice(0, 5).forEach(([name, user]) => {
    console.log(`  ${name}: ${generateEmail(name)}`);
  });
  if (employees.length > 5) {
    console.log(`  ... and ${employees.length - 5} more employees`);
  }

  return userMap;
}

async function seedProjects(): Promise<string[]> {
  console.log('Seeding projects...');
  const projectIds: string[] = [];

  for (const project of PROJECTS) {
    const result = await pool.query(
      'INSERT INTO projects (name, billable) VALUES ($1, $2) RETURNING id',
      [project.name, project.billable]
    );
    projectIds.push(result.rows[0].id);
  }

  console.log(`  Created ${projectIds.length} projects`);
  return projectIds;
}

async function seedDailyUsage(userMap: Map<string, { id: string; role: string; teamId: string }>) {
  console.log('Seeding daily usage data (this may take a while)...');

  const users = Array.from(userMap.values());
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 180);

  let totalRecords = 0;
  const batchSize = 1000;
  let batch: any[] = [];

  for (const user of users) {
    const currentDate = new Date(startDate);

    // User-specific patterns
    const baseProductivity = 0.5 + Math.random() * 0.3; // 50-80%
    const worksWeekends = Math.random() < 0.1; // 10% work weekends

    while (currentDate <= endDate) {
      const weekend = isWeekend(currentDate);

      // Skip most weekend days
      if (weekend && !worksWeekends && Math.random() < 0.95) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      // Generate realistic work hours (360-600 minutes = 6-10 hours)
      const totalDuration = weekend
        ? randomInt(60, 180) // 1-3 hours on weekends
        : randomInt(360, 600); // 6-10 hours on weekdays

      const productiveRatio = baseProductivity + (Math.random() - 0.5) * 0.2;
      const productiveDuration = Math.round(totalDuration * productiveRatio);
      const unproductiveRatio = Math.random() * 0.15;
      const unproductiveDuration = Math.round(totalDuration * unproductiveRatio);
      const neutralDuration = totalDuration - productiveDuration - unproductiveDuration;

      const projectRatio = 0.6 + Math.random() * 0.3; // 60-90% on projects
      const projectDuration = Math.round(productiveDuration * projectRatio);
      const nonProjectDuration = productiveDuration - projectDuration;

      const idleDuration = randomInt(10, 60); // 10-60 minutes idle

      batch.push({
        userId: user.id,
        date: currentDate.toISOString().split('T')[0],
        totalDuration,
        productiveDuration,
        unproductiveDuration,
        neutralDuration,
        projectDuration,
        nonProjectDuration,
        idleDuration,
      });

      if (batch.length >= batchSize) {
        await insertDailyUsageBatch(batch);
        totalRecords += batch.length;
        process.stdout.write(`\r  Inserted ${totalRecords} daily usage records...`);
        batch = [];
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  // Insert remaining batch
  if (batch.length > 0) {
    await insertDailyUsageBatch(batch);
    totalRecords += batch.length;
  }

  console.log(`\n  Created ${totalRecords} daily usage records`);
}

async function insertDailyUsageBatch(batch: any[]) {
  const values = batch.map((_, i) => {
    const offset = i * 9;
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`;
  }).join(', ');

  const params = batch.flatMap(r => [
    r.userId, r.date, r.totalDuration, r.productiveDuration,
    r.unproductiveDuration, r.neutralDuration, r.projectDuration,
    r.nonProjectDuration, r.idleDuration
  ]);

  await pool.query(`
    INSERT INTO daily_usage (user_id, date, total_duration, productive_duration,
      unproductive_duration, neutral_duration, project_duration,
      non_project_duration, idle_duration)
    VALUES ${values}
  `, params);
}

async function seedAppUsage(userMap: Map<string, { id: string; role: string; teamId: string }>) {
  console.log('Seeding app usage data...');

  const users = Array.from(userMap.values());
  const allApps = [
    ...APPS.productive.map(a => ({ ...a, rating: 'productive' as const })),
    ...APPS.neutral.map(a => ({ ...a, rating: 'neutral' as const })),
    ...APPS.unproductive.map(a => ({ ...a, rating: 'unproductive' as const })),
  ];

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 180);

  let totalRecords = 0;
  const batchSize = 1000;
  let batch: any[] = [];

  for (const user of users) {
    // Each user has favorite apps
    const userApps = randomChoices(allApps, randomInt(8, 15));
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      if (isWeekend(currentDate) && Math.random() < 0.9) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      // Generate 5-12 app usage entries per day
      const appsToday = randomChoices(userApps, randomInt(5, 12));

      for (const app of appsToday) {
        const duration = randomInt(5, 120); // 5-120 minutes

        batch.push({
          userId: user.id,
          date: currentDate.toISOString().split('T')[0],
          appName: app.name,
          category: app.category,
          duration,
          productivityRating: app.rating,
        });

        if (batch.length >= batchSize) {
          await insertAppUsageBatch(batch);
          totalRecords += batch.length;
          process.stdout.write(`\r  Inserted ${totalRecords} app usage records...`);
          batch = [];
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  if (batch.length > 0) {
    await insertAppUsageBatch(batch);
    totalRecords += batch.length;
  }

  console.log(`\n  Created ${totalRecords} app usage records`);
}

async function insertAppUsageBatch(batch: any[]) {
  const values = batch.map((_, i) => {
    const offset = i * 6;
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
  }).join(', ');

  const params = batch.flatMap(r => [
    r.userId, r.date, r.appName, r.category, r.duration, r.productivityRating
  ]);

  await pool.query(`
    INSERT INTO app_usage (user_id, date, app_name, category, duration, productivity_rating)
    VALUES ${values}
  `, params);
}

async function seedProjectTime(
  userMap: Map<string, { id: string; role: string; teamId: string }>,
  projectIds: string[]
) {
  console.log('Seeding project time data...');

  const users = Array.from(userMap.values());
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 180);

  let totalRecords = 0;
  const batchSize = 1000;
  let batch: any[] = [];

  for (const user of users) {
    // Each user works on 2-5 projects
    const userProjects = randomChoices(projectIds, randomInt(2, 5));
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      if (isWeekend(currentDate) && Math.random() < 0.95) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      // Work on 1-3 projects per day
      const projectsToday = randomChoices(userProjects, randomInt(1, 3));

      for (const projectId of projectsToday) {
        const duration = randomInt(30, 240); // 30 mins to 4 hours

        batch.push({
          userId: user.id,
          projectId,
          date: currentDate.toISOString().split('T')[0],
          duration,
        });

        if (batch.length >= batchSize) {
          await insertProjectTimeBatch(batch);
          totalRecords += batch.length;
          process.stdout.write(`\r  Inserted ${totalRecords} project time records...`);
          batch = [];
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  if (batch.length > 0) {
    await insertProjectTimeBatch(batch);
    totalRecords += batch.length;
  }

  console.log(`\n  Created ${totalRecords} project time records`);
}

async function insertProjectTimeBatch(batch: any[]) {
  const values = batch.map((_, i) => {
    const offset = i * 4;
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`;
  }).join(', ');

  const params = batch.flatMap(r => [r.userId, r.projectId, r.date, r.duration]);

  await pool.query(`
    INSERT INTO project_time (user_id, project_id, date, duration)
    VALUES ${values}
  `, params);
}

async function seedClassificationRules() {
  console.log('Seeding classification rules...');

  const allApps = [
    ...APPS.productive.map(a => ({ ...a, classification: 'productive' as const })),
    ...APPS.neutral.map(a => ({ ...a, classification: 'neutral' as const })),
    ...APPS.unproductive.map(a => ({ ...a, classification: 'unproductive' as const })),
  ];

  let count = 0;
  for (const app of allApps) {
    await pool.query(
      `INSERT INTO classification_rules (app_name, classification, confidence, reasoning)
       VALUES ($1, $2, $3, $4)`,
      [
        app.name,
        app.classification,
        0.95,
        `Default classification for ${app.category} application`,
      ]
    );
    count++;
  }

  console.log(`  Created ${count} classification rules`);
}

async function main() {
  console.log('Starting seed process...\n');
  const startTime = Date.now();

  try {
    await clearTables();

    const teamMap = await seedTeams();
    const userMap = await seedUsers(teamMap);
    const projectIds = await seedProjects();

    await seedDailyUsage(userMap);
    await seedAppUsage(userMap);
    await seedProjectTime(userMap, projectIds);
    await seedClassificationRules();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\nSeed completed in ${duration}s`);

    // Print summary
    const counts = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM teams) as teams,
        (SELECT COUNT(*) FROM users) as users,
        (SELECT COUNT(*) FROM projects) as projects,
        (SELECT COUNT(*) FROM daily_usage) as daily_usage,
        (SELECT COUNT(*) FROM app_usage) as app_usage,
        (SELECT COUNT(*) FROM project_time) as project_time,
        (SELECT COUNT(*) FROM classification_rules) as rules
    `);

    console.log('\nDatabase summary:');
    console.log(`  Teams: ${counts.rows[0].teams}`);
    console.log(`  Users: ${counts.rows[0].users}`);
    console.log(`  Projects: ${counts.rows[0].projects}`);
    console.log(`  Daily usage records: ${counts.rows[0].daily_usage}`);
    console.log(`  App usage records: ${counts.rows[0].app_usage}`);
    console.log(`  Project time records: ${counts.rows[0].project_time}`);
    console.log(`  Classification rules: ${counts.rows[0].rules}`);

  } catch (error) {
    console.error('Seed failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

main();

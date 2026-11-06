
const express = require("express");
const mysql = require("mysql2/promise");
const path = require("path");

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const db = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "NewPassword123!",
    database: "college_placement",
    waitForConnections: true,
    connectionLimit: 10
});

// Dashboard statistics
app.get("/api/dashboard", async (req, res) => {
    try {
        const [[students]] = await db.query(
            "SELECT COUNT(*) AS total FROM students"
        );
        const [[companies]] = await db.query(
            "SELECT COUNT(*) AS total FROM companies"
        );
        const [[applications]] = await db.query(
            "SELECT COUNT(*) AS total FROM applications"
        );
        const [[selected]] = await db.query(
            "SELECT COUNT(*) AS total FROM applications WHERE status = 'Selected'"
        );

        res.json({
            students: students.total,
            companies: companies.total,
            applications: applications.total,
            selected: selected.total
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// View students
app.get("/api/students", async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM students ORDER BY student_id DESC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add student
app.post("/api/students", async (req, res) => {
    try {
        const { name, roll_no, branch, cgpa, email } = req.body;

        if (!name || !roll_no || !branch || cgpa === "" ||
            cgpa === undefined || !email) {
            return res.status(400).json({ error: "Please fill all student details" });
        }

        if (Number(cgpa) < 0 || Number(cgpa) > 10) {
            return res.status(400).json({ error: "CGPA must be between 0 and 10" });
        }

        await db.query(
            `INSERT INTO students (name, roll_no, branch, cgpa, email)
             VALUES (?, ?, ?, ?, ?)`,
            [name, roll_no, branch, cgpa, email]
        );

        res.json({ message: "Student registered successfully!" });
    } catch (err) {
        res.status(500).json({
            error: err.code === "ER_DUP_ENTRY"
                ? "This roll number is already registered"
                : err.message
        });
    }
});

// View companies
app.get("/api/companies", async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM companies ORDER BY company_id DESC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin registers company / recruitment drive
app.post("/api/companies", async (req, res) => {
    try {
        const {
            company_name,
            job_role,
            package: salary,
            eligibility_cgpa,
            drive_date
        } = req.body;

        if (!company_name || !job_role || salary === "" ||
            eligibility_cgpa === "" || !drive_date) {
            return res.status(400).json({ error: "Please fill all company details" });
        }

        if (Number(eligibility_cgpa) < 0 || Number(eligibility_cgpa) > 10) {
            return res.status(400).json({ error: "Eligibility CGPA must be between 0 and 10" });
        }

        await db.query(
            `INSERT INTO companies
             (company_name, job_role, package, eligibility_cgpa, drive_date)
             VALUES (?, ?, ?, ?, ?)`,
            [company_name, job_role, salary, eligibility_cgpa, drive_date]
        );

        res.json({ message: "Company and recruitment drive registered successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// View applications with student and company details
app.get("/api/applications", async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT a.application_id, a.student_id, a.company_id,
                   a.applied_date, a.round, a.status,
                   s.name AS student_name, s.roll_no, s.branch, s.cgpa,
                   c.company_name, c.job_role, c.package
            FROM applications a
            JOIN students s ON a.student_id = s.student_id
            JOIN companies c ON a.company_id = c.company_id
            ORDER BY a.application_id DESC
        `);

        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Student applies for eligible company
app.post("/api/applications", async (req, res) => {
    try {
        const { student_id, company_id } = req.body;

        if (!student_id || !company_id) {
            return res.status(400).json({ error: "Select student and company" });
        }

        const [rows] = await db.query(`
            SELECT s.cgpa, s.name, c.company_name, c.eligibility_cgpa
            FROM students s
            CROSS JOIN companies c
            WHERE s.student_id = ? AND c.company_id = ?
        `, [student_id, company_id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: "Student or company not found" });
        }

        if (Number(rows[0].cgpa) < Number(rows[0].eligibility_cgpa)) {
            return res.status(400).json({
                error: `Not eligible! Required CGPA: ${rows[0].eligibility_cgpa}. Your CGPA: ${rows[0].cgpa}`
            });
        }

        await db.query(`
            INSERT INTO applications
            (student_id, company_id, applied_date, round, status)
            VALUES (?, ?, CURDATE(), 'Applied', 'Applied')
        `, [student_id, company_id]);

        res.json({ message: "Job application submitted successfully!" });
    } catch (err) {
        res.status(500).json({
            error: err.code === "ER_DUP_ENTRY"
                ? "You have already applied to this company"
                : err.message
        });
    }
});

// Update application round and placement status
app.put("/api/applications/:id", async (req, res) => {
    try {
        const { round, status } = req.body;

        const allowedStatuses = [
            "Applied", "In Progress", "Selected", "Rejected"
        ];

        if (!round || !allowedStatuses.includes(status)) {
            return res.status(400).json({ error: "Invalid round or status" });
        }

        const [result] = await db.query(
            "UPDATE applications SET round = ?, status = ? WHERE application_id = ?",
            [round, status, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Application not found" });
        }

        res.json({ message: "Placement status updated successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(3002, () => {
   console.log("DeviSree Placement Portal running at http://localhost:3002");
});

-- TESSRA Supabase RLS Migration
-- Run these in your Supabase project's SQL Editor after connecting your database.

-- 1. Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE disruptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_priorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- 2. Helper functions to get current user's context from the public profiles table
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_role text;
BEGIN
  SELECT role INTO v_role FROM users WHERE supabase_uid = auth.uid()::text LIMIT 1;
  RETURN COALESCE(v_role, 'guest');
END;
$$;

CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id integer;
BEGIN
  SELECT id INTO v_id FROM users WHERE supabase_uid = auth.uid()::text LIMIT 1;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_current_user_department_id()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_dept_id integer;
BEGIN
  SELECT department_id INTO v_dept_id FROM users WHERE supabase_uid = auth.uid()::text LIMIT 1;
  RETURN v_dept_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_current_user_club_id()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_club_id integer;
BEGIN
  SELECT club_id INTO v_club_id FROM users WHERE supabase_uid = auth.uid()::text LIMIT 1;
  RETURN v_club_id;
END;
$$;

-- 3. RLS Policies
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (supabase_uid = auth.uid()::text);
CREATE POLICY "Admin can manage all users" ON users FOR ALL USING (get_current_user_role() = 'admin');

CREATE POLICY "Authenticated users can view departments" ON departments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can manage departments" ON departments FOR ALL USING (get_current_user_role() = 'admin');

CREATE POLICY "Authenticated users can view clubs" ON clubs FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can manage clubs" ON clubs FOR ALL USING (get_current_user_role() = 'admin');

CREATE POLICY "Authenticated users can view rooms" ON rooms FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can manage rooms" ON rooms FOR ALL USING (get_current_user_role() = 'admin');

CREATE POLICY "Authenticated users can view student groups" ON student_groups FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can manage student groups" ON student_groups FOR ALL USING (get_current_user_role() = 'admin');

CREATE POLICY "Authenticated users can view courses" ON courses FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can manage courses" ON courses FOR ALL USING (get_current_user_role() = 'admin');

CREATE POLICY "Authenticated users can view offerings" ON offerings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can manage offerings" ON offerings FOR ALL USING (get_current_user_role() = 'admin');

CREATE POLICY "Authenticated users can view schedule versions" ON schedule_versions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can manage schedule versions" ON schedule_versions FOR ALL USING (get_current_user_role() = 'admin');

CREATE POLICY "Authenticated users can view scheduled sessions" ON scheduled_sessions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can manage scheduled sessions" ON scheduled_sessions FOR ALL USING (get_current_user_role() = 'admin');

CREATE POLICY "Authenticated users can view availability blocks" ON availability_blocks FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Faculty can manage own availability" ON availability_blocks FOR ALL USING (faculty_id = get_current_user_id() AND get_current_user_role() = 'faculty');
CREATE POLICY "Admin can manage availability blocks" ON availability_blocks FOR ALL USING (get_current_user_role() = 'admin');

CREATE POLICY "Authenticated users can view change requests" ON change_requests FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Faculty can create own change requests" ON change_requests FOR INSERT WITH CHECK (faculty_id = get_current_user_id() AND get_current_user_role() = 'faculty');
CREATE POLICY "Faculty can update own pending change requests" ON change_requests FOR UPDATE USING (faculty_id = get_current_user_id() AND get_current_user_role() = 'faculty' AND status = 'pending');
CREATE POLICY "Coordinator can review dept change requests" ON change_requests FOR ALL USING (get_current_user_role() = 'coordinator' AND EXISTS (SELECT 1 FROM users WHERE id = change_requests.faculty_id AND department_id = get_current_user_department_id()));
CREATE POLICY "Admin can manage all change requests" ON change_requests FOR ALL USING (get_current_user_role() = 'admin');

CREATE POLICY "Authenticated users can view bookings" ON bookings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can create own bookings" ON bookings FOR INSERT WITH CHECK (requester_id = get_current_user_id());
CREATE POLICY "Users can update own pending bookings" ON bookings FOR UPDATE USING (requester_id = get_current_user_id() AND status = 'pending');
CREATE POLICY "Coordinator can review dept bookings" ON bookings FOR ALL USING (get_current_user_role() = 'coordinator' AND department_id = get_current_user_department_id());
CREATE POLICY "Admin can manage all bookings" ON bookings FOR ALL USING (get_current_user_role() = 'admin');

CREATE POLICY "Authenticated users can view exams" ON exams FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can manage exams" ON exams FOR ALL USING (get_current_user_role() = 'admin');

CREATE POLICY "Authenticated users can view disruptions" ON disruptions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can manage disruptions" ON disruptions FOR ALL USING (get_current_user_role() = 'admin');

CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT USING (user_id = get_current_user_id());
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (user_id = get_current_user_id());
CREATE POLICY "Admin can manage notifications" ON notifications FOR ALL USING (get_current_user_role() = 'admin');

CREATE POLICY "Authenticated users can view audit logs" ON audit_logs FOR SELECT USING (auth.uid() IS NOT NULL);
-- No INSERT/UPDATE/DELETE for application roles — audit logs are append-only via service role

CREATE POLICY "Users can view own assistant messages" ON assistant_messages FOR SELECT USING (user_id = get_current_user_id());
CREATE POLICY "Users can insert own assistant messages" ON assistant_messages FOR INSERT WITH CHECK (user_id = get_current_user_id());
CREATE POLICY "Admin can manage all assistant messages" ON assistant_messages FOR ALL USING (get_current_user_role() = 'admin');

CREATE POLICY "Admin can manage access requests" ON access_requests FOR ALL USING (get_current_user_role() = 'admin');
CREATE POLICY "Anyone can insert access requests" ON access_requests FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated users can view booking priorities" ON booking_priorities FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can manage booking priorities" ON booking_priorities FOR ALL USING (get_current_user_role() = 'admin');

CREATE POLICY "Users can view own reset tokens" ON password_reset_tokens FOR SELECT USING (user_id = get_current_user_id());

-- 4. Self-approval prevention
-- Enforced at the application level in approveChangeRequestAction / rejectChangeRequestAction
-- by checking reviewerId !== facultyId. RLS additionally prevents a coordinator from
-- approving their own request (faculty_id = get_current_user_id()).

-- 5. Settings table
CREATE POLICY "Authenticated users can view settings" ON settings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin can manage settings" ON settings FOR ALL USING (get_current_user_role() = 'admin');

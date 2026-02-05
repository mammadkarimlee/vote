import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './app/Layout'
import { HomeRedirect } from './app/HomeRedirect'
import { RequireAuth } from './app/RequireAuth'
import { RequireRole } from './app/RequireRole'
import { LoginPage } from './features/auth/LoginPage'
import { ProfilePage } from './features/auth/ProfilePage'
import { TaskListPage } from './features/tasks/TaskListPage'
import { TaskVotePage } from './features/tasks/TaskVotePage'
import { BranchLayout } from './features/branch/BranchLayout'
import { BranchTeachersPage } from './features/branch/BranchTeachersPage'
import { BranchStudentsPage } from './features/branch/BranchStudentsPage'
import { BranchGroupsPage } from './features/branch/BranchGroupsPage'
import { BranchSubjectsPage } from './features/branch/BranchSubjectsPage'
import { BranchDepartmentsPage } from './features/branch/BranchDepartmentsPage'
import { BranchAssignmentsPage } from './features/branch/BranchAssignmentsPage'
import { BranchProfilesPage } from './features/branch/BranchProfilesPage'
import { BranchManagementAssignmentsPage } from './features/branch/BranchManagementAssignmentsPage'
import { BranchResultsPage } from './features/branch/BranchResultsPage'
import { BranchCyclesPage } from './features/branch/BranchCyclesPage'
import { BranchCycleDetailPage } from './features/branch/BranchCycleDetailPage'
import { BranchPkpdPage } from './features/branch/BranchPkpdPage'
import { PkpdCalculatorPage } from './features/pkpd/PkpdCalculatorPage'
import { PkpdDocumentPage } from './features/pkpd/PkpdDocumentPage'
import { AdminBranchesPage } from './features/admin/AdminBranchesPage'
import { AdminUsersPage } from './features/admin/AdminUsersPage'
import { AdminCyclesPage } from './features/admin/AdminCyclesPage'
import { AdminQuestionsPage } from './features/admin/AdminQuestionsPage'
import { AdminDashboardPage } from './features/admin/AdminDashboardPage'
import { AdminCycleDetailPage } from './features/admin/AdminCycleDetailPage'

const App = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<RequireAuth><Layout /></RequireAuth>}>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/me" element={<ProfilePage />} />
      <Route
        path="/vote"
        element={
          <RequireRole roles={['student', 'teacher', 'manager']}>
            <TaskListPage />
          </RequireRole>
        }
      />
      <Route
        path="/vote/:taskId"
        element={
          <RequireRole roles={['student', 'teacher', 'manager']}>
            <TaskVotePage />
          </RequireRole>
        }
      />
      <Route
        path="/pkpd"
        element={
          <RequireRole roles={['branch_admin', 'moderator', 'superadmin']}>
            <Navigate to="/pkpd/doc" replace />
          </RequireRole>
        }
      />
      <Route
        path="/pkpd/doc"
        element={
          <RequireRole roles={['branch_admin', 'moderator', 'superadmin']}>
            <PkpdDocumentPage />
          </RequireRole>
        }
      />
      <Route
        path="/pkpd/calculator"
        element={
          <RequireRole roles={['branch_admin', 'moderator', 'superadmin']}>
            <PkpdCalculatorPage />
          </RequireRole>
        }
      />
      <Route
        path="/branch"
        element={
          <RequireRole roles={['branch_admin', 'moderator', 'superadmin']}>
            <BranchLayout />
          </RequireRole>
        }
      >
        <Route path="teachers" element={<BranchTeachersPage />} />
        <Route path="students" element={<BranchStudentsPage />} />
        <Route path="groups" element={<BranchGroupsPage />} />
        <Route path="subjects" element={<BranchSubjectsPage />} />
        <Route path="departments" element={<BranchDepartmentsPage />} />
        <Route path="assignments" element={<BranchAssignmentsPage />} />
        <Route path="management" element={<BranchManagementAssignmentsPage />} />
        <Route path="profiles" element={<BranchProfilesPage />} />
        <Route path="results/:section?" element={<BranchResultsPage />} />
        <Route path="cycles" element={<BranchCyclesPage />} />
        <Route path="cycles/:cycleId" element={<BranchCycleDetailPage />} />
        <Route path="pkpd" element={<BranchPkpdPage />} />
      </Route>
      <Route
        path="/admin"
        element={
          <RequireRole roles={['superadmin']}>
            <BranchLayout isAdmin />
          </RequireRole>
        }
      >
        <Route path="branches" element={<AdminBranchesPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="dashboard/:section?" element={<AdminDashboardPage />} />
        <Route path="cycles" element={<AdminCyclesPage />} />
        <Route path="cycles/:cycleId" element={<AdminCycleDetailPage />} />
        <Route path="questions" element={<AdminQuestionsPage />} />
      </Route>
    </Route>
  </Routes>
)

export default App


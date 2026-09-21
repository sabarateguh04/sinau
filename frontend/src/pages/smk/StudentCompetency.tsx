import { useAuth } from '@/store/auth';
import Competency, { StudentCompetency } from './Competency';

export default function CompetencyPage() {
  const { has, hasRole } = useAuth();
  if (hasRole('SISWA') && !has('competency:write') && !has('competency:assess')) return <StudentCompetency />;
  return <Competency />;
}

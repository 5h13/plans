/** Feature screens, registered by route segment (#/p/:id/<segment>/...). */
import { screens } from "./registry";
import { DeliverableScreen, PlanScreen, ScheduleScreen } from "./PlanScreens";
import { StagesScreen } from "./StageEstimateScreens";
import { EstimateScreen, LibraryScreen } from "./EstimateLibraryScreens";
import { CompareReportsScreen, ExportScreen, ImportScreen, ProgressScreen, ReportScreen, RevisionsScreen } from "./ProgressExchangeScreens";
import { ChangesScreen, CommentScreen, CommentsScreen, DocumentsScreen, RegistersScreen, RisksScreen } from "./RegisterScreens";

Object.assign(screens, {
  plan: PlanScreen,
  schedule: ScheduleScreen,
  deliverable: DeliverableScreen,
  registers: RegistersScreen,
  comments: CommentsScreen,
  comment: CommentScreen,
  risks: RisksScreen,
  changes: ChangesScreen,
  documents: DocumentsScreen,
  stages: StagesScreen,
  estimate: EstimateScreen,
  "app:library": LibraryScreen,
  progress: ProgressScreen,
  report: ReportScreen,
  compare: CompareReportsScreen,
  revisions: RevisionsScreen,
  export: ExportScreen,
  "app:import": ImportScreen,
});

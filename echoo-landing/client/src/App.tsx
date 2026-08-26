/** Echoo blue-and-white app shell. */
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import NewsletterConfirmation from "./pages/NewsletterConfirmation";
import Release from "./pages/Release";

function Router() { return <Switch><Route path="/" component={Home} /><Route path="/release" component={Release} /><Route path="/newsletter/confirm" component={NewsletterConfirmation} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>; }
function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light" switchable><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>; }
export default App;

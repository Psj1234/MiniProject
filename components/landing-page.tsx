"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Menu, X, BookOpen, Users, Zap } from "lucide-react";
import { useState } from "react";

export default function LandingPage({
  onGetStarted,
}: {
  onGetStarted: () => void;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Navigation Bar */}
      <header className="sticky top-0 z-50 border-b border-slate-700 bg-slate-800/50 backdrop-blur">
        <nav className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-2xl font-bold text-blue-400">VidyaMitra</div>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-8">
            <a
              href="#home"
              className="text-slate-300 hover:text-white transition"
            >
              Home
            </a>
            <a
              href="#features"
              className="text-slate-300 hover:text-white transition"
            >
              Features
            </a>
            <a
              href="#about"
              className="text-slate-300 hover:text-white transition"
            >
              About Us
            </a>
          </div>

          {/* Desktop Buttons */}
          <div className="hidden md:flex items-center gap-4"></div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-slate-300 hover:text-white"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </nav>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-700 bg-slate-800 px-6 py-4 space-y-4">
            <a
              href="#home"
              className="block text-slate-300 hover:text-white transition"
            >
              Home
            </a>
            <a
              href="#features"
              className="block text-slate-300 hover:text-white transition"
            >
              Features
            </a>
            <a
              href="#about"
              className="block text-slate-300 hover:text-white transition"
            >
              About Us
            </a>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section id="home" className="max-w-7xl mx-auto px-6 py-20 md:py-32">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h1 className="text-5xl md:text-6xl font-bold text-white leading-tight">
              Smarter Education, Personalized for You.
            </h1>
            <p className="text-xl text-slate-300">
              Our platform identifies your unique learning style—fast, average,
              or steady—to provide the resources you need to succeed.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                onClick={onGetStarted}
                className="bg-blue-600 hover:bg-blue-700 text-white text-lg h-12 px-8"
              >
                Get Started Today
              </Button>
              <Button
                variant="outline"
                className="border-slate-600 text-slate-200 hover:bg-slate-700 text-lg h-12 px-8"
              >
                Learn More
              </Button>
            </div>
          </div>

          {/* Hero Video Area */}
          <div className="relative h-96 w-full rounded-2xl border border-slate-700 bg-slate-800/30 overflow-hidden">
            <video
              src="/datavideo.mp4"
              autoPlay
              loop
              muted
              playsInline
              className="absolute top-0 left-0 w-full h-full object-cover opacity-7Un"
            />
            {/* This overlay darkens the video so text is readable */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/50 to-transparent"></div>

            {/* You can still keep text over it */}
            <div className="absolute bottom-4 left-4">
              <p className="text-sm font-medium text-white">
                Personalized Analytics Engine
              </p>
              <p className="text-xs text-slate-400">Powered by AI</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section
        id="features"
        className="max-w-7xl mx-auto px-6 py-20 bg-slate-800/30 border-t border-b border-slate-700"
      >
        <div className="mb-16 text-center">
          <h2 className="text-4xl font-bold text-white mb-4">
            Powerful Features
          </h2>
          <p className="text-xl text-slate-400">
            Everything you need for smarter learning
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Feature 1 */}
          <Card className="bg-slate-800 border-slate-700 hover:border-blue-500 transition">
            <CardContent className="pt-8 space-y-4">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-500/20 rounded-lg">
                <BookOpen className="text-blue-400" size={24} />
              </div>
              <h3 className="text-xl font-semibold text-white">For Students</h3>
              <p className="text-slate-400">
                Learn at your own pace with AI-generated quizzes and tailored
                resources personalized to your learning style.
              </p>
            </CardContent>
          </Card>

          {/* Feature 2 */}
          <Card className="bg-slate-800 border-slate-700 hover:border-blue-500 transition">
            <CardContent className="pt-8 space-y-4">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-500/20 rounded-lg">
                <Users className="text-blue-400" size={24} />
              </div>
              <h3 className="text-xl font-semibold text-white">
                For Professors
              </h3>
              <p className="text-slate-400">
                Easily track your class, identify student needs, and upload
                course materials. Manage quizzes and monitor progress
                effortlessly.
              </p>
            </CardContent>
          </Card>

          {/* Feature 3 */}
          <Card className="bg-slate-800 border-slate-700 hover:border-blue-500 transition">
            <CardContent className="pt-8 space-y-4">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-500/20 rounded-lg">
                <Zap className="text-blue-400" size={24} />
              </div>
              <h3 className="text-xl font-semibold text-white">AI-Powered</h3>
              <p className="text-slate-400">
                Our intelligent system helps create dynamic quizzes and
                identifies learning patterns for continuous improvement.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center space-y-6">
          <h2 className="text-4xl font-bold text-white">About VidyaMitra</h2>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto">
            VidyaMitra is a learning management system designed to bridge the
            gap between traditional education and personalized learning. We
            believe every student learns differently, and our platform adapts to
            your unique needs.
          </p>
          <Button
            onClick={onGetStarted}
            className="bg-blue-600 hover:bg-blue-700 text-white text-lg h-12 px-8"
          >
            Join VidyaMitra Today
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-700 bg-slate-800/30 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="text-white font-semibold mb-4">VidyaMitra</h3>
              <p className="text-slate-400 text-sm">
                Smarter education for everyone
              </p>
            </div>
            <div>
              <h4 className="text-slate-300 font-semibold mb-4">Quick Links</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>
                  <a href="#" className="hover:text-white transition">
                    Home
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition">
                    Contact
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-slate-300 font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>
                  <a href="#" className="hover:text-white transition">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition">
                    Terms of Service
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-slate-300 font-semibold mb-4">Contact</h4>
              <p className="text-slate-400 text-sm">support@vidyamitra.com</p>
            </div>
          </div>

          <div className="border-t border-slate-700 pt-8">
            <p className="text-center text-slate-500 text-sm">
              © 2025 VidyaMitra. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

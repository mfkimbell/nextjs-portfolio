// src/app/lib/projects.ts

export type Project = {
  name: string;
  description: string;
  logo: string;
  tech: string[];
  github: string;
  // new: per‑project gradient tailwind classes
  gradient: string;
};

export const projects: Project[] = [
  {
    name: "AWS SaaS DevOps Webapp Template",
    description: `Fully automated DevOps template 
    for deploying a SaaS web application on AWS using Terraform, 
    GitHub Actions, and ECS. It includes a Next.js frontend and a 
    FastAPI backend with PostgreSQL (RDS), featuring a JWT-based 
    authentication system and a credit-based usage model. It uses 
    SQLAlchemy as an ORM to manipulate database data.`,
    logo: "/projects/saas.png",
    tech: [
      "ECS",
      "PostgreSQL",
      "NextJS",
      "NextAuth",
      "React",
      "Redux",
      "SQLAlchemy",
      "Docker",
      "FastAPI",
      "Terraform",
      "Hashicorp Cloud",
      "Decorator Pattern",
      "Repository Pattern"
    ],
    github: "https://github.com/mfkimbell/aws-saas-webapp-template",
    gradient: "from-orange-400 to-orange-600",
  },
  {
    name: "WorkSync",
    description:
      "24h hackathon project automating inventory and suggestion workflows on Google Cloud with Terraform, Cloud Run, Artifact Registry, Secrets Manager, Next.js, React, Redux, and FastAPI.",
    logo: "/projects/worksync.png",
    tech: [
      "Google Cloud",
      "Terraform",
      "GitHub Actions",
      "Cloud Run",
      "Artifact Registry",
      "Secrets Manager",
      "Next.js",
      "React",
      "Redux",
      "FastAPI",
      "CockroachDB",
    ],
    github: "https://github.com/mfkimbell/ua-inn-2025",
    gradient: "from-green-400 to-teal-500",
  },
  {
    name: "Whisker",
    description:
      "Direct-to-customer cat product sales web app showcasing Twilio Verify, Segment, Conversations API, SendGrid, Flex integrations with personalized real-time ads.",
    logo: "/projects/whisker.png",
    tech: [
      "Next.js",
      "Redux",
      "TailwindCSS",
      "Twilio Verify",
      "Twilio Segment",
      "Twilio Conversations API",
      "Twilio SendGrid",
      "Twilio Flex",
      "PostgreSQL",
      "Prisma",
    ],
    github: "https://github.com/mfkimbell/whisker",
    gradient: "from-pink-500 to-rose-500",
  },
  {
    name: "Spaceify",
    description:
      "Auburn Hackathon 2024 project: React web app on AWS EC2 rendering playlists as a low-poly solar system with computer vision color mapping, Dockerized backend/frontend/Nginx.",
    logo: "/projects/spaceify.png",
    tech: [
      "React",
      "AWS EC2",
      "Docker",
      "NGINX",
      "SciKit-Learn",
      "Computer Vision",
      "MultiThreading",
    ],
    github: "https://github.com/uabhacks-at-auhacks24/frontend-in-space",
    gradient: "from-yellow-400 to-orange-500",
  },
  {
    name: "AI Recruit Tracker",
    description:
      "Hackathon app with React frontend, FastAPI backend, MongoDB storage, and OpenAI API for AI-generated HR feedback. Secure auth portal for students and staff.",
    logo: "/projects/recruit.png",
    tech: ["Docker", "React", "FastAPI", "OpenAI", "MongoDB"],
    github: "https://github.com/mfkimbell/ai-recruit-tracker",
    gradient: "from-violet-600 to-purple-700",
  },
  {
    name: "AWS DevOps Pipeline",
    description:
      "Jenkins + Ansible-driven CI/CD pipeline with SonarQube for code analysis, Docker builds, JFrog Artifactory storage, and Kubernetes deployment on AWS.",
    logo: "/projects/devops2.png",
    tech: [
      "Terraform",
      "AWS EC2",
      "AWS EKS",
      "Jenkins",
      "SonarQube",
      "Ansible",
      "Docker",
      "Kubernetes",
      "JFrog Artifactory",
    ],
    github: "https://github.com/mfkimbell/terraform-aws-DevOps",
    gradient: "from-gray-700 to-gray-900",
  },
  {
    name: "AWS SAM Serverless Zoo Manager",
    description:
      "AWS GameDay hack project: SAM template provisioning API Gateway, Lambda, EventBridge, DynamoDB, and Step Functions for animal registry and feeding automation.",
    logo: "/projects/zoo.png",
    tech: ["AWS SAM", "API Gateway", "Lambda", "EventBridge", "DynamoDB", "Step Functions", "IAM"],
    github: "https://github.com/mfkimbell/aws-serverless-zoo-management",
    gradient: "from-emerald-400 to-green-600",
  },
  {
    name: "End-to-End DevOps Pipeline",
    description:
      "Jenkins polls GitHub, runs Ansible to build and push Docker images, and deploys to Kubernetes pods with load balancing for zero-downtime updates.",
    logo: "/projects/devops.png",
    tech: ["AWS EC2", "AWS EKS", "Jenkins", "Ansible", "Docker", "Kubernetes", "Tomcat", "Maven"],
    github: "https://github.com/mfkimbell/end-to-end-DevOps-pipeline",
    gradient: "from-blue-800 to-blue-900",
  },
  {
    name: "Serverless Django WebApp",
    description:
      "Dockerized Django + Postgres app on AWS ECS Fargate with ECR, S3 static storage, HTTPS, custom domain, and CI/CD.",
    logo: "/projects/fargate.png",
    tech: ["Django", "PostgreSQL", "Docker", "AWS ECS", "Fargate", "ECR", "S3", "Boto3", "ACM"],
    github: "https://github.com/mfkimbell/django-serverless-webapp",
    gradient: "from-indigo-700 to-indigo-900",
  },
  {
    name: "Catalog Web Scraper",
    description:
      "Async Python scraper using asyncio, RabbitMQ, and Docker to extract book data into PostgreSQL and expose via Flask API.",
    logo: "/projects/scrape.png",
    tech: ["Python", "Asyncio", "RabbitMQ", "PostgreSQL", "Flask", "Docker"],
    github: "https://github.com/mfkimbell/catalog-web-scraper",
    gradient: "from-red-400 to-red-600",
  },
  {
    name: "RecruitWise",
    description:
      "Google AI Hack project: React + FastAPI job-recruiter chatbot using Gemini, RAG with Pinecone embeddings, and Google Cloud hosting.",
    logo: "/projects/google.png",
    tech: ["React", "FastAPI", "Google Cloud", "Gemini", "Pinecone", "RAG", "Dotenv"],
    github: "https://github.com/Google-Hack-Ai-UAB",
    gradient: "from-blue-300 to-sky-500",
  },
  {
    name: "Kafka Stock Market Data Stream",
    description:
      "Jupyter notebook producer/consumer streaming market data via AWS MSK Kafka, storing JSON in S3, crawled by Glue, and queried with Athena.",
    logo: "/projects/kafka.png",
    tech: ["Kafka", "AWS MSK", "Jupyter", "AWS S3", "AWS Glue", "AWS Athena", "Pandas"],
    github: "https://github.com/mfkimbell/aws-msk-kafka",
    gradient: "from-yellow-500 to-amber-600",
  },
  {
    name: "AI Histopathology Segmenter",
    description:
      "Semantic segmentation of histology slides using PathML, UNet, PyTorch, Docker, and NVIDIA CUDA for digital pathology.",
    logo: "/projects/skin.png",
    tech: ["PathML", "PyTorch", "U-Net", "Docker", "Computer Vision", "CUDA"],
    github: "https://github.com/Summit-Technology-Consulting/stratum-pathml",
    gradient: "from-teal-500 to-cyan-600",
  },
  {
    name: "AI Marketing Agent",
    description:
      "Embeddable React iframe and FastAPI backend on Firebase/Cloud Run, using OpenAI and GitHub Actions for AI-driven marketing assistance.",
    logo: "/projects/marketing.png",
    tech: ["React", "OpenAI API", "FastAPI", "Firebase", "Cloud Run", "GitHub Actions"],
    github: "https://github.com/jaypyles/marketingviaai",
    gradient: "from-pink-400 to-pink-600",
  },
  {
    name: "AI Company Agent",
    description:
      "Amazon Bedrock and Claude Sonnet-based Bedrock Agent with Lambda, OpenAPI schema, DynamoDB, and RAG on OpenSearch embeddings.",
    logo: "/projects/agent.png",
    tech: ["Bedrock Agent", "Claude 3 Sonnet", "AWS Lambda", "OpenAPI", "DynamoDB", "OpenSearch", "RAG"],
    github: "https://github.com/mfkimbell/ai-company-agent",
    gradient: "from-gray-500 to-gray-700",
  },
  {
    name: "AI Chatbot",
    description:
      "Streamlit frontend with Langchain and Anthropic Claude-3 Haiku LLM, Dockerized Python chatbot maintaining conversation memory.",
    logo: "/projects/chatbot.png",
    tech: ["Streamlit", "Langchain", "Claude-3-Haiku", "Docker"],
    github: "https://github.com/mfkimbell/ai-chatbot",
    gradient: "from-blue-200 to-blue-400",
  },
  {
    name: "AI RAG Document QA",
    description:
      "PDF QA bot using AWS Bedrock Titan embeddings and FAISS, running in Docker with Streamlit and Langchain for RAG-based answers.",
    logo: "/projects/rag.png",
    tech: ["Bedrock", "FAISS", "Streamlit", "Langchain", "Docker"],
    github: "https://github.com/mfkimbell/ai-rag-pdf",
    gradient: "from-purple-400 to-purple-600",
  },
  {
    name: "Cloud File Upload Service",
    description:
      "Flask webserver on AWS Lambda + SNS for file uploads, email share links, with MySQL RDS backend.",
    logo: "/projects/aws.png",
    tech: ["AWS Lambda", "SNS", "Flask", "MySQL RDS"],
    github: "https://github.com/mfkimbell/cloud-file-upload-service",
    gradient: "from-green-300 to-green-500",
  },
  {
    name: "S3 Website Hosting Custom Action",
    description:
      "GitHub composite, JavaScript, and Docker Actions for CI/CD deploying static site to Amazon S3.",
    logo: "/projects/aws2.png",
    tech: ["GitHub Actions", "Composite Actions", "JavaScript Actions", "Docker Actions", "AWS S3"],
    github: "https://github.com/mfkimbell/github-actions-custom-actions",
    gradient: "from-orange-400 to-orange-600",
  },
  {
    name: "Golang gRPC Microservice",
    description:
      "gRPC service in Go with HTTP/2 fallback storing orders in PostgreSQL, language-agnostic clients via code-generated .proto.",
    logo: "/projects/grpc.png",
    tech: ["Go", "gRPC", "PostgreSQL", "HTTP/2"],
    github: "https://github.com/mfkimbell/go-grpc-microservice",
    gradient: "from-blue-700 to-blue-900",
  },
  {
    name: "React Movie Database GUI",
    description:
      "C#/.NET React GUI CRUD client for Microsoft SQL Server via Entity Framework Core.",
    logo: "/projects/movie.png",
    tech: ["React", "C#", "Entity Framework Core", "SQL Server"],
    github: "https://github.com/mfkimbell/react-movie-database",
    gradient: "from-red-600 to-red-800",
  },
  {
    name: "NLP Sentiment Analysis for SQL Database",
    description:
      "Python NLTK and SpaCy pipeline adding sentiment polarity to PostgreSQL posts table.",
    logo: "/projects/sentiment.png",
    tech: ["Python", "HuggingFace Transformers", "NLTK", "SpaCy", "PostgreSQL"],
    github: "https://github.com/mfkimbell/reviews-nlp-sentiment-analysis",
    gradient: "from-yellow-300 to-yellow-500",
  },
  {
    name: "Golang GraphQL Server",
    description:
      "Basic GraphQL server in Go using gqlgen and MongoDB, supporting queries and mutations.",
    logo: "/projects/graphql.png",
    tech: ["Golang", "GraphQL", "gqlgen", "MongoDB"],
    github: "https://github.com/mfkimbell/go-graphql-server",
    gradient: "from-cyan-400 to-cyan-600",
  },
  {
    name: "Agriculture Monitoring Drone",
    description:
      "JavaFX GUI controlling Tello SDK drone for agricultural monitoring dashboard.",
    logo: "/projects/drone.png",
    tech: ["Java", "JavaFX", "Tello SDK"],
    github: "https://github.com/mfkimbell/agricultural-monitoring-drone",
    gradient: "from-green-600 to-green-800",
  },
  {
    name: "Buildwise",
    description:
      "ReactFlow-based AI devops architecture visualizer using OpenAI API and React frontend with Docker.",
    logo: "/projects/buildwise.png",
    tech: ["ReactFlow", "OpenAI API", "Docker", "TailwindCSS", "TypeScript"],
    github: "https://github.com/mfkimbell/buildwise",
    gradient: "from-indigo-400 to-purple-500",
  },
  {
    name: "GitHub Actions CI/CD Tutorial",
    description:
      "Tutorial repo demonstrating GitHub Actions workflows for CI/CD with automated issue comments.",
    logo: "/projects/actions.png",
    tech: ["GitHub Actions", "CI/CD", "JavaScript"],
    github: "https://github.com/mfkimbell/github-actions-pipeline",
    gradient: "from-gray-400 to-gray-600",
  },
];

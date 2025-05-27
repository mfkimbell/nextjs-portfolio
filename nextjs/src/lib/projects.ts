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
      `{Built in 24 hours for UA Hackathon 2025. This project automatically 
      provisions inventory and suggestion‑tracking workflows on Google Cloud. It leverages Terraform and GitHub Actions to provision Cloud Run, 
      store container images in Artifact Registry, and manage secrets via Secrets Manager. The application features a Next.js frontend (with React, Redux, and NextAuth‑style sessions) and a FastAPI backend connected to CockroachDB via SQLAlchemy. The NextJS app is zipped and run in Google Cloud Functions, which Firebase points to. Administrators can manage requests, calculate costs, maintain inventory, and track spending/request data on a dashboard, while end users submit and monitor requests in real time.}`,
    logo: "/projects/worksync.png",
    tech: [
      "Hashicorp Cloud",
      "Terraform",
      "GitHub Actions",
      "Cloud Run",
      "Artifact Registry",
      "Cloud Functions",
      "Secrets Manager",
      "Firebase",
      "Next.js",
      "Redux",
      "SQLAlchemy",
      "CockroachDB",
    ],
    
    github: "https://github.com/mfkimbell/ua-inn-2025",
    gradient: "from-green-400 to-teal-500",
  },
  {
    name: "Whisker",
    description:
    "Next.js webapp made to show off Twilio Segment and communication tools. Whisker is a direct‑to‑customer cat product sales company with a blog. It uses Twilio Verify to authenticate users with two‑factor authentication. It tracks user data on Twilio Segment and uses that data to target users with personalized ads, send messages via Twilio Conversations APO, and send emails through Twilio SendGrid. Advertisements update in real time based on the categories users view. Finally, it allows users to contact a live agent using Twilio Flex.",
    logo: "/projects/whisker.png",
    tech: [
      "Next.js",
      "Vercel",
      "Redux",
      "Twilio Verify",
      "Twilio SendGrid",
      "Twilio Conversations API",
      "Twilio Flex",
      "Twilio Segment",
      "Neon Postgres",
      "Prisma",
      "ShadCN",
      "TailwindCSS",
    ],
       
    github: "https://github.com/mfkimbell/whisker",
    gradient: "from-pink-500 to-rose-500",
  },
  {
    name: "Spaceify",
    description: "Built in 24 hours for Auburn Hackathon 2024 Space Theme. React web app hosted on AWS EC2 that allows users to dynamically populate 3D renderings of playlists as a solar system. Song metadata determines factors like planet size, speed, and rotation. Users can click on planets to hear 30-second snippets of the song each planet represents. It employs computer vision via SciKit-Learn to map album art palettes to planet color gradients. It utilizes Docker to host the backend, frontend, and NGINX.",
    logo: "/projects/spaceify.png",
    tech: [
      "AWS EC2",
      "Docker",
      "NGINX",
      "React",
      "SciKit-Learn",
      "Computer Vision",
      "MultiThreading",
    ],
    github: "https://github.com/uabhacks-at-auhacks24/frontend-in-space",
    gradient: "from-green-400 to-green-500",
  },
  
  {
    name: "AI Recruit Tracker",
    description: "Built in 24 hours for UA Hackathon 2024. React web app designed to help CGI in their recruiting efforts. The application allows mobile users to easily input information into a MongoDB database. It implements a combined authentication portal for both students and CGI staff with secure endpoints that cannot be accessed manually. Students can update their information and upload resumes at any time. HR staff can provide additional feedback, update any fields, and use the OpenAI API to generate feedback based on parsing submitted resumes.",
    logo: "/projects/recruit.png",
    tech: [
      "Docker",
      "React",
      "FastAPI",
      "OpenAI",
      "MongoDB",
    ],
    github: "https://github.com/mfkimbell/ai-recruit-tracker",
    gradient: "from-violet-600 to-purple-700",
  },
  
  {
    name: "AWS DevOps Pipeline",
    description: "Jenkins + Ansible-driven CI/CD pipeline with SonarQube for code analysis, Docker builds, JFrog Artifactory storage, and Kubernetes deployment on AWS.",
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
    description: "Built in 10 hours for AWS GameDay Hackathon Regions 2024. A serverless AWS project using a full Serverless Application Model (SAM) template. It creates an API Gateway API for managing animal registry entries. A CloudWatch EventBridge bus rule triggers a Lambda function to automate animal feeding. Animal data is stored in DynamoDB, and processing workflows run in Step Functions using a Map state to invoke Lambdas in parallel.",
    logo: "/projects/zoo.png",
    tech: [
      "Serverless Application Model (SAM)",
      "API Gateway",
      "EventBridge Cron jobs",
      "Lambda",
      "DynamoDB",
      "Step Functions",
      "IAM",
    ],
    github: "https://github.com/mfkimbell/aws-serverless-zoo-management",
    gradient: "from-yellow-400 to-yellow-600",
  },
  {
    name: "End-to-End DevOps Pipeline",
    description: "A simple web application deployed to production on AWS via an automated DevOps pipeline. Jenkins polls GitHub for code changes to the Tomcat‑hosted web app, then runs Ansible scripts to build new Docker images, push them to DockerHub, and deploy updated containers to Kubernetes clusters behind a load balancer.",
    logo: "/projects/devops.png",
    tech: [
      "AWS EC2",
      "AWS EKS",
      "Jenkins",
      "Tomcat",
      "Maven",
      "Ansible",
      "Docker",
      "Kubernetes",
    ],
    github: "https://github.com/mfkimbell/end-to-end-DevOps",
    gradient: "from-blue-500 to-blue-700",
  },
  {
    name: "Serverless Django WebApp",
    description: "A Django web application using PostgreSQL for user data and AWS S3 for static file storage. The application is containerized with Docker and pushed to Amazon Elastic Container Registry (ECR). It is deployed on Amazon Elastic Container Service (ECS) with the Fargate serverless launch type, including HTTPS support and a custom domain.",
    logo: "/projects/fargate.png",
    tech: [
      "AWS CLI",
      "Boto3",
      "Certificate Manager",
      "Django",
      "Docker",
      "ECR",
      "ECS",
      "Fargate",
      "Gunicorn",
      "Postgres",
      "RDS",
      "Route53",
    ],
    github: "https://github.com/mfkimbell/django-serverless-webapp",
    gradient: "from-indigo-500 to-indigo-700",
  },
  {
    name: "Catalog Web Scraper",
    description: "A Python web scraper for extracting book information from an online catalog using Xlml. It scrapes data asynchronously with Asyncio and RabbitMQ queues, stores results in PostgreSQL, and provides a Flask API for querying the database. The scraper supports retrieving additional book details beyond what the site directly provides. The entire project is containerized with Docker.",
    logo: "/projects/scrape.png",
    tech: [
      "Python",
      "Xlml",
      "Asyncio",
      "RabbitMQ",
      "PostgreSQL",
      "Flask",
      "Docker",
    ],
    github: "https://github.com/mfkimbell/catalog-web-scraper",
    gradient: "from-green-400 to-green-600",
  },
  
{
  name: "Kafka Stock Market Data Stream",
  description: "This project uses Jupyter Notebooks to produce messages to an Apache Kafka stream hosted on AWS MSK. Stock market API data is consumed by a Jupyter consumer and stored in S3. An AWS Glue crawler ingests the JSON files from S3 and transforms them into a data catalog for real‑time querying in AWS Athena.",
  logo: "/projects/kafka.png",
  tech: [
    "Kafka",
    "Jupyter Notebooks",
    "Pandas",
    "AWS MSK",
    "AWS EC2",
    "AWS Glue",
    "AWS S3",
  ],
  github: "https://github.com/mfkimbell/aws-msk-kafka/tree/main",
  gradient: "from-red-400 to-red-600",
},
{
  name: "AI Histopathology Segmenter",
  description: "Performs semantic segmentation of skin patches in histopathology images using PyTorch and a U‑Net CNN. Tiled image patches are preprocessed and stored with PathML, then loaded into PyTorch DataLoader for training. Training is accelerated with NVIDIA CUDA Toolkit, and the pipeline runs in Docker for reproducibility. Once trained, the model segments new images and extracts target areas to enable AI‑assisted digital pathology.",
  logo: "/projects/skin.png",
  tech: [
    "PathML",
    "PyTorch",
    "Docker",
    "U‑Net",
    "Deep Learning",
    "Computer Vision",
    "NVIDIA CUDA Toolkit",
  ],
  github: "https://github.com/Summit-Technology-Consulting/stratum-pathml",
  gradient: "from-purple-400 to-purple-600",
},
{
  name: "AI Marketing Agent",
  description: "A commissioned project accessible via an embeddable iframe. The React frontend is hosted on Firebase, and the FastAPI backend runs on Google Cloud Run. It communicates with OpenAI’s API to generate marketing content. On code changes, GitHub Actions builds a Docker image, pushes it to Google Artifact Registry, and Cloud Run pulls it. Secrets are managed in GitHub Secrets and Google Secrets Manager.",
  logo: "/projects/marketing.png",
  tech: [
    "GitHub Actions",
    "React",
    "Firebase",
    "Google Cloud",
    "Google Cloud Run",
    "Google Secrets Manager",
    "Google Artifact Registry",
    "OpenAI API",
    "Docker",
    "FastAPI",
  ],
  github: "https://github.com/jaypyles/marketingviaai",
  gradient: "from-orange-400 to-orange-600",
},
{
  name: "AI Company Agent",
  description: "Demonstrates building a company AI agent using Amazon Bedrock and Claude 3 Sonnet to interpret user inputs and execute API operations via AWS Lambda. The agent uses semantic matching to map prompts to OpenAPI‑defined operations. Banking records are stored in DynamoDB, queried by the Bedrock agent with RAG‑powered similarity search against embeddings in an OpenSearch vector store, all backed by S3‑hosted PDF documents.",
  logo: "/projects/agent.png",
  tech: [
    "RAG",
    "Bedrock Agent",
    "Bedrock Knowledge Base",
    "Claude 3 Sonnet",
    "Lambda",
    "OpenAPI Schema",
  ],
  github: "https://github.com/mfkimbell/ai-company-agent/tree/main",
  gradient: "from-teal-400 to-teal-600",
},
{
  name: "AI Chatbot",
  description: "Dockerized Python application providing a Streamlit UI for an AI chatbot. It uses Langchain and Anthropic’s Claude‑3‑Haiku LLM to maintain conversation memory and deliver contextually accurate responses.",
  logo: "/projects/chatbot.png",
  tech: [
    "Langchain",
    "Bedrock",
    "Claude 3 Haiku",
    "Streamlit",
    "Docker",
  ],
  github: "https://github.com/mfkimbell/ai-chatbot",
  gradient: "from-blue-300 to-blue-500",
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
